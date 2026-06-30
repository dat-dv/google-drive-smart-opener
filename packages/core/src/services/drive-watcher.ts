import * as fs from 'fs'
import * as path from 'path'
import * as chokidar from 'chokidar'
import { Document, calculateFileMd5 } from '@shared'
import { DocumentRepository } from '../ports/repositories'
import { CloudProvider } from '../ports/cloud-provider'
import * as crypto from 'crypto'

/**
 * Service to watch Drive folders recursively using chokidar.
 * Automatically synchronizes changes (creates, updates, deletes, renames) to SQLite index.
 * Matches R5 (File Watcher) and R9 (Conflict Detection) requirements.
 */
export class DriveWatcher {
  private readonly docRepo: DocumentRepository
  private readonly cloudProvider: CloudProvider
  private rootWatcher: chokidar.FSWatcher | null = null

  constructor(docRepo: DocumentRepository, cloudProvider: CloudProvider) {
    this.docRepo = docRepo
    this.cloudProvider = cloudProvider
  }

  /**
   * Initializes and starts watching the entire Google Drive root directory.
   */
  public async start(): Promise<void> {
    const driveRoot = this.cloudProvider.getDriveRootPath()
    if (!fs.existsSync(driveRoot)) {
      return
    }

    // Initialize Chokidar FSWatcher for the entire Google Drive root path
    this.rootWatcher = chokidar.watch(driveRoot, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // ignore files already present on startup
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    })

    // Wire events
    this.rootWatcher.on('add', (filePath) => this.handleFileAdded(filePath, null))
    this.rootWatcher.on('change', (filePath) => this.handleFileChanged(filePath))
    this.rootWatcher.on('unlink', (filePath) => this.handleFileDeleted(filePath))
  }

  /**
   * Stops the active root watcher.
   */
  public async stop(): Promise<void> {
    if (this.rootWatcher) {
      await this.rootWatcher.close()
      this.rootWatcher = null
    }
  }

  /**
   * Deprecated / Kept for backwards compatibility
   */
  public watchMapping(_mapping: unknown): Promise<void> {
    void _mapping
    return Promise.resolve()
  }

  /**
   * Deprecated / Kept for backwards compatibility
   */
  public unwatchMapping(_mappingId: string): Promise<void> {
    void _mappingId
    return Promise.resolve()
  }

  /**
   * Handles file creation events on Drive.
   * Resolves renames/moves by checking if the hash already exists on a deleted document (R5).
   */
  private async handleFileAdded(absoluteFilePath: string, mappingId: string | null): Promise<void> {
    try {
      const driveRoot = this.cloudProvider.getDriveRootPath()
      const relativeDrivePath = path.relative(driveRoot, absoluteFilePath)
      const filename = path.basename(absoluteFilePath)

      const stats = fs.statSync(absoluteFilePath)
      const hash = await calculateFileMd5(absoluteFilePath)

      // Check if file is already indexed in DB at this path
      const existingDoc = await this.docRepo.findByDrivePath(relativeDrivePath)
      if (existingDoc) {
        existingDoc.driveHash = hash
        existingDoc.driveModifiedTime = stats.mtime.toISOString()
        existingDoc.metadata.size = stats.size
        existingDoc.status = 'LINKED'
        await this.docRepo.update(existingDoc)
        return
      }

      // Check for rename/move: find a doc with the same hash that is marked DRIVE_DELETED
      const matchingDocs = await this.docRepo.findByDriveHash(hash)
      const movedDoc = matchingDocs.find((doc) => doc.status === 'DRIVE_DELETED')

      if (movedDoc) {
        // Move detected: Update path and restore status
        movedDoc.drivePath = relativeDrivePath
        movedDoc.status = 'LINKED'
        movedDoc.driveModifiedTime = stats.mtime.toISOString()
        movedDoc.metadata.size = stats.size
        await this.docRepo.update(movedDoc)
        return
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
          provider: 'google-drive'
        },
        folderMappingId: mappingId
      }

      await this.docRepo.create(newDoc)
    } catch (error) {
      // Fail-safe logging for file access errors (e.g. temp locking)
      console.error(`Watcher error processing add event for ${absoluteFilePath}:`, error)
    }
  }

  /**
   * Handles file modification events on Drive.
   * Detects real-time modification conflicts (R9).
   */
  private async handleFileChanged(absoluteFilePath: string): Promise<void> {
    try {
      const driveRoot = this.cloudProvider.getDriveRootPath()
      const relativeDrivePath = path.relative(driveRoot, absoluteFilePath)

      const doc = await this.docRepo.findByDrivePath(relativeDrivePath)
      if (!doc) return

      const stats = fs.statSync(absoluteFilePath)
      const newDriveHash = await calculateFileMd5(absoluteFilePath)

      // Conflict detection: If local copy exists and has unsynced changes
      if (doc.localOriginalPath && fs.existsSync(doc.localOriginalPath)) {
        const currentLocalHash = await calculateFileMd5(doc.localOriginalPath)

        if (doc.localHash && currentLocalHash !== doc.localHash) {
          // CONFLICT: Both sides changed!
          doc.driveHash = newDriveHash
          doc.driveModifiedTime = stats.mtime.toISOString()
          doc.metadata.size = stats.size
          doc.status = 'CONFLICT'
          await this.docRepo.update(doc)
          return
        }
      }

      // No conflict: Standard update
      doc.driveHash = newDriveHash
      doc.driveModifiedTime = stats.mtime.toISOString()
      doc.metadata.size = stats.size
      doc.status = 'LINKED'
      await this.docRepo.update(doc)
    } catch (error) {
      console.error(`Watcher error processing change event for ${absoluteFilePath}:`, error)
    }
  }

  /**
   * Handles file deletion events on Drive.
   * Marks status as DRIVE_DELETED instead of removing mapping records (R8).
   */
  private async handleFileDeleted(absoluteFilePath: string): Promise<void> {
    try {
      const driveRoot = this.cloudProvider.getDriveRootPath()
      const relativeDrivePath = path.relative(driveRoot, absoluteFilePath)

      const doc = await this.docRepo.findByDrivePath(relativeDrivePath)
      if (doc) {
        doc.status = 'DRIVE_DELETED'
        await this.docRepo.update(doc)
      }
    } catch (error) {
      console.error(`Watcher error processing delete event for ${absoluteFilePath}:`, error)
    }
  }

  private guessMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    switch (ext) {
      case '.txt':
        return 'text/plain'
      case '.pdf':
        return 'application/pdf'
      case '.docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      case '.doc':
        return 'application/msword'
      case '.xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      case '.xls':
        return 'application/vnd.ms-excel'
      case '.pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      case '.ppt':
        return 'application/vnd.ms-powerpoint'
      case '.png':
        return 'image/png'
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg'
      default:
        return 'application/octet-stream'
    }
  }
}
