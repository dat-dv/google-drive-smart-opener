import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { Document, FolderMapping, calculateFileMd5 } from '@shared';
import { DocumentRepository, FolderMappingRepository } from '../ports/repositories';
import { CloudProvider } from '../ports/cloud-provider';
import * as crypto from 'crypto';

/**
 * Service to watch Drive folders recursively using chokidar.
 * Automatically synchronizes changes (creates, updates, deletes, renames) to SQLite index.
 * Matches R5 (File Watcher) and R9 (Conflict Detection) requirements.
 */
export class DriveWatcher {
  private readonly docRepo: DocumentRepository;
  private readonly mappingRepo: FolderMappingRepository;
  private readonly cloudProvider: CloudProvider;
  private readonly watchers = new Map<string, chokidar.FSWatcher>();

  constructor(
    docRepo: DocumentRepository,
    mappingRepo: FolderMappingRepository,
    cloudProvider: CloudProvider
  ) {
    this.docRepo = docRepo;
    this.mappingRepo = mappingRepo;
    this.cloudProvider = cloudProvider;
  }

  /**
   * Initializes and starts watching all active folder mappings stored in the DB.
   */
  public async start(): Promise<void> {
    const mappings = await this.mappingRepo.list();
    for (const mapping of mappings) {
      await this.watchMapping(mapping);
    }
  }

  /**
   * Stops all active watchers.
   */
  public async stop(): Promise<void> {
    for (const [mappingId, watcher] of this.watchers.entries()) {
      await watcher.close();
      this.watchers.delete(mappingId);
    }
  }

  /**
   * Dynamically starts watching a specific folder mapping path.
   */
  public async watchMapping(mapping: FolderMapping): Promise<void> {
    if (this.watchers.has(mapping.id)) {
      return; // Already watching
    }

    const driveRoot = this.cloudProvider.getDriveRootPath();
    const absolutePathToWatch = path.join(driveRoot, mapping.driveFolderPath);

    if (!fs.existsSync(absolutePathToWatch)) {
      // Create folder if missing
      fs.mkdirSync(absolutePathToWatch, { recursive: true });
    }

    // Initialize Chokidar FSWatcher
    const watcher = chokidar.watch(absolutePathToWatch, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // ignore files already present on startup (handled by initial sync)
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    // Wire events
    watcher.on('add', (filePath) => this.handleFileAdded(filePath, mapping.id));
    watcher.on('change', (filePath) => this.handleFileChanged(filePath));
    watcher.on('unlink', (filePath) => this.handleFileDeleted(filePath));

    this.watchers.set(mapping.id, watcher);
  }

  /**
   * Dynamically stops watching a specific folder mapping.
   */
  public async unwatchMapping(mappingId: string): Promise<void> {
    const watcher = this.watchers.get(mappingId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(mappingId);
    }
  }

  /**
   * Handles file creation events on Drive.
   * Resolves renames/moves by checking if the hash already exists on a deleted document (R5).
   */
  private async handleFileAdded(absoluteFilePath: string, mappingId: string): Promise<void> {
    try {
      const driveRoot = this.cloudProvider.getDriveRootPath();
      const relativeDrivePath = path.relative(driveRoot, absoluteFilePath);
      const filename = path.basename(absoluteFilePath);

      const stats = fs.statSync(absoluteFilePath);
      const hash = await calculateFileMd5(absoluteFilePath);

      // Check if file is already indexed in DB at this path
      const existingDoc = await this.docRepo.findByDrivePath(relativeDrivePath);
      if (existingDoc) {
        existingDoc.driveHash = hash;
        existingDoc.driveModifiedTime = stats.mtime.toISOString();
        existingDoc.metadata.size = stats.size;
        existingDoc.status = 'LINKED';
        await this.docRepo.update(existingDoc);
        return;
      }

      // Check for rename/move: find a doc with the same hash that is marked DRIVE_DELETED
      const matchingDocs = await this.docRepo.findByDriveHash(hash);
      const movedDoc = matchingDocs.find(
        (doc) => doc.status === 'DRIVE_DELETED'
      );

      if (movedDoc) {
        // Move detected: Update path and restore status
        movedDoc.drivePath = relativeDrivePath;
        movedDoc.status = 'LINKED';
        movedDoc.driveModifiedTime = stats.mtime.toISOString();
        movedDoc.metadata.size = stats.size;
        await this.docRepo.update(movedDoc);
        return;
      }

      // Fresh new file: Create a new Document record
      const newDoc: Document = {
        id: crypto.randomUUID(),
        drivePath: relativeDrivePath,
        localOriginalPath: null,
        driveHash: hash,
        localHash: null,
        driveModifiedTime: stats.mtime.toISOString(),
        localModifiedTime: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOpened: null,
        status: 'LINKED',
        metadata: {
          size: stats.size,
          mimeType: this.guessMimeType(filename),
          provider: 'google-drive',
        },
        folderMappingId: mappingId,
      };

      await this.docRepo.create(newDoc);
    } catch (error) {
      // Fail-safe logging for file access errors (e.g. temp locking)
      console.error(`Watcher error processing add event for ${absoluteFilePath}:`, error);
    }
  }

  /**
   * Handles file modification events on Drive.
   * Detects real-time modification conflicts (R9).
   */
  private async handleFileChanged(absoluteFilePath: string): Promise<void> {
    try {
      const driveRoot = this.cloudProvider.getDriveRootPath();
      const relativeDrivePath = path.relative(driveRoot, absoluteFilePath);

      const doc = await this.docRepo.findByDrivePath(relativeDrivePath);
      if (!doc) return;

      const stats = fs.statSync(absoluteFilePath);
      const newDriveHash = await calculateFileMd5(absoluteFilePath);

      // Conflict detection: If local copy exists and has unsynced changes
      if (doc.localOriginalPath && fs.existsSync(doc.localOriginalPath)) {
        const currentLocalHash = await calculateFileMd5(doc.localOriginalPath);
        
        if (doc.localHash && currentLocalHash !== doc.localHash) {
          // CONFLICT: Both sides changed!
          doc.driveHash = newDriveHash;
          doc.driveModifiedTime = stats.mtime.toISOString();
          doc.metadata.size = stats.size;
          doc.status = 'CONFLICT';
          await this.docRepo.update(doc);
          return;
        }
      }

      // No conflict: Standard update
      doc.driveHash = newDriveHash;
      doc.driveModifiedTime = stats.mtime.toISOString();
      doc.metadata.size = stats.size;
      doc.status = 'LINKED';
      await this.docRepo.update(doc);
    } catch (error) {
      console.error(`Watcher error processing change event for ${absoluteFilePath}:`, error);
    }
  }

  /**
   * Handles file deletion events on Drive.
   * Marks status as DRIVE_DELETED instead of removing mapping records (R8).
   */
  private async handleFileDeleted(absoluteFilePath: string): Promise<void> {
    try {
      const driveRoot = this.cloudProvider.getDriveRootPath();
      const relativeDrivePath = path.relative(driveRoot, absoluteFilePath);

      const doc = await this.docRepo.findByDrivePath(relativeDrivePath);
      if (doc) {
        doc.status = 'DRIVE_DELETED';
        await this.docRepo.update(doc);
      }
    } catch (error) {
      console.error(`Watcher error processing delete event for ${absoluteFilePath}:`, error);
    }
  }

  private guessMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.txt': return 'text/plain';
      case '.pdf': return 'application/pdf';
      case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case '.pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case '.png': return 'image/png';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      default: return 'application/octet-stream';
    }
  }
}
