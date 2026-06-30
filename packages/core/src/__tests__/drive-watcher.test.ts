import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseManager } from '@database';
import { SQLiteDocumentRepository, SQLiteFolderMappingRepository } from '@database';
import { GoogleDriveProvider } from '../services/google-drive-provider';
import { DriveWatcher } from '../services/drive-watcher';
import { FolderMapping } from '@shared';
import * as crypto from 'crypto';

// Helper to pause execution waiting for async FS events
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('DriveWatcher Integration Tests', () => {
  let tempDir: string;
  let driveRoot: string;
  let localWorkspace: string;
  
  let dbManager: DatabaseManager;
  let docRepo: SQLiteDocumentRepository;
  let mappingRepo: SQLiteFolderMappingRepository;
  let provider: GoogleDriveProvider;
  let watcher: DriveWatcher;

  beforeEach(() => {
    // Setup clean, unique directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-watcher-test-'));
    // Resolve symlinks (critical on macOS since /var is symlinked to /private/var)
    tempDir = fs.realpathSync(tempDir);
    
    driveRoot = path.join(tempDir, 'drive_mirror');
    localWorkspace = path.join(tempDir, 'local_workspace');
    fs.mkdirSync(driveRoot);
    fs.mkdirSync(localWorkspace);

    // Database Initialization
    dbManager = new DatabaseManager(':memory:');
    dbManager.connect();
    docRepo = new SQLiteDocumentRepository(() => dbManager.getDatabase());
    mappingRepo = new SQLiteFolderMappingRepository(() => dbManager.getDatabase());

    // Provider Initialization
    provider = new GoogleDriveProvider(driveRoot);

    // Watcher Initialization
    watcher = new DriveWatcher(docRepo, mappingRepo, provider);
  });

  afterEach(async () => {
    // Ensure all watchers are closed before tearing down directories
    await watcher.stop();
    dbManager.disconnect();
    
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createMapping = async (driveSubfolder: string): Promise<FolderMapping> => {
    const mapping: FolderMapping = {
      id: crypto.randomUUID(),
      localFolderPath: localWorkspace,
      driveFolderPath: driveSubfolder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ACTIVE',
    };
    await mappingRepo.create(mapping);
    return mapping;
  };

  it('should initialize and watch mapping directories', async () => {
    const mapping = await createMapping('My Drive/WatchedSub');
    await watcher.watchMapping(mapping);

    const watchedAbsPath = path.join(driveRoot, 'My Drive/WatchedSub');
    expect(fs.existsSync(watchedAbsPath)).toBe(true);
  });

  it('should auto-index new files added in the watched directory (add event)', async () => {
    const mapping = await createMapping('My Drive/SyncFolder');
    await watcher.watchMapping(mapping);
    await delay(200); // Allow watcher time to initialize on OS level

    // Create file inside Drive watched folder
    const targetFilePath = path.join(driveRoot, 'My Drive/SyncFolder/new_report.txt');
    fs.writeFileSync(targetFilePath, 'Important financial reporting text.');

    // Wait for Chokidar stability check (300ms stability + buffer)
    await delay(600);

    // Assert file index added in SQLite
    const doc = await docRepo.findByDrivePath('My Drive/SyncFolder/new_report.txt');
    expect(doc).not.toBeNull();
    expect(doc?.metadata.size).toBe(35);
    expect(doc?.folderMappingId).toBe(mapping.id);
  });

  it('should update driveHash and size on file modification (change event)', async () => {
    const mapping = await createMapping('My Drive/SyncFolder');
    await watcher.watchMapping(mapping);
    await delay(200);

    // Add initial file on disk and DB
    const targetFilePath = path.join(driveRoot, 'My Drive/SyncFolder/edit.txt');
    fs.writeFileSync(targetFilePath, 'Initial Content');
    
    // Wait for initial index
    await delay(600);
    const doc = await docRepo.findByDrivePath('My Drive/SyncFolder/edit.txt');
    expect(doc).not.toBeNull();
    const originalHash = doc?.driveHash;

    // Modify file
    fs.writeFileSync(targetFilePath, 'Updated Content data');
    
    // Wait for change event
    await delay(600);
    const updatedDoc = await docRepo.findByDrivePath('My Drive/SyncFolder/edit.txt');
    expect(updatedDoc).not.toBeNull();
    expect(updatedDoc?.driveHash).not.toBe(originalHash);
    expect(updatedDoc?.metadata.size).toBe(20);
  });

  it('should detect real-time conflict if both local and Drive files modified (R9)', async () => {
    const mapping = await createMapping('My Drive/SyncFolder');
    await watcher.watchMapping(mapping);
    await delay(200);

    const localFile = path.join(localWorkspace, 'document.txt');
    const driveFile = path.join(driveRoot, 'My Drive/SyncFolder/document.txt');

    fs.writeFileSync(localFile, 'Synced content');
    fs.writeFileSync(driveFile, 'Synced content');

    // Wait for watcher to pick up and add document to DB
    await delay(600);
    const doc = await docRepo.findByDrivePath('My Drive/SyncFolder/document.txt');
    expect(doc).not.toBeNull();

    if (doc) {
      // Establish the link in database manually
      doc.localOriginalPath = localFile;
      doc.localHash = '99745318182b8a7fa9b2447953258c70'; // Hash of 'Synced content'
      doc.driveHash = '99745318182b8a7fa9b2447953258c70';
      doc.status = 'LINKED';
      await docRepo.update(doc);

      // 1. Simulate local change outside app
      fs.writeFileSync(localFile, 'Local user change');

      // 2. Simulate Drive change triggering watcher
      fs.writeFileSync(driveFile, 'Drive user change');

      // Wait for watcher to trigger change handler
      await delay(600);

      const conflictDoc = await docRepo.findByDrivePath('My Drive/SyncFolder/document.txt');
      expect(conflictDoc).not.toBeNull();
      expect(conflictDoc?.status).toBe('CONFLICT');
    }
  });

  it('should set status to DRIVE_DELETED when file is removed from disk (unlink event)', async () => {
    const mapping = await createMapping('My Drive/SyncFolder');
    await watcher.watchMapping(mapping);
    await delay(200);

    const targetFilePath = path.join(driveRoot, 'My Drive/SyncFolder/delete_me.txt');
    fs.writeFileSync(targetFilePath, 'Goodbye');

    await delay(600);
    const doc = await docRepo.findByDrivePath('My Drive/SyncFolder/delete_me.txt');
    expect(doc).not.toBeNull();

    // Delete file
    fs.unlinkSync(targetFilePath);

    // Wait for unlink event
    await delay(600);

    const deletedDoc = await docRepo.findByDrivePath('My Drive/SyncFolder/delete_me.txt');
    expect(deletedDoc).not.toBeNull();
    expect(deletedDoc?.status).toBe('DRIVE_DELETED');
  });

  it('should resolve renaming/moving files by updating existing index paths (R5)', async () => {
    const mapping = await createMapping('My Drive/MoveFolder');
    await watcher.watchMapping(mapping);
    await delay(200);

    const oldFilePath = path.join(driveRoot, 'My Drive/MoveFolder/source.txt');
    const newFilePath = path.join(driveRoot, 'My Drive/MoveFolder/destination.txt');

    fs.writeFileSync(oldFilePath, 'Relocated data content');

    // Wait for initial index
    await delay(600);
    const doc = await docRepo.findByDrivePath('My Drive/MoveFolder/source.txt');
    expect(doc).not.toBeNull();
    
    // Simulate unlink (mark DRIVE_DELETED)
    doc!.status = 'DRIVE_DELETED';
    await docRepo.update(doc!);

    // Execute rename on disk
    fs.renameSync(oldFilePath, newFilePath);

    // Wait for rename events (unlink + add)
    await delay(600);

    // Verify database path updated to destination, preserving ID
    const updatedDoc = await docRepo.findByDrivePath('My Drive/MoveFolder/destination.txt');
    expect(updatedDoc).not.toBeNull();
    expect(updatedDoc?.id).toBe(doc?.id);
    expect(updatedDoc?.status).toBe('LINKED');
    
    // Verify old path is no longer indexed or marked differently
    const oldDoc = await docRepo.findByDrivePath('My Drive/MoveFolder/source.txt');
    expect(oldDoc).toBeNull();
  });
});
