import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../database-manager';
import { SQLiteFolderMappingRepository } from '../repositories/folder-mapping-repository';
import { SQLiteDocumentRepository } from '../repositories/document-repository';
import { FolderMapping, Document } from '@shared/types';
import * as crypto from 'crypto';

describe('SQLite Database Layer Integration Tests', () => {
  let dbManager: DatabaseManager;

  beforeEach(() => {
    // Use :memory: database to isolate test state and maximize performance
    dbManager = new DatabaseManager(':memory:');
    dbManager.connect();
  });

  afterEach(() => {
    dbManager.disconnect();
  });

  describe('DatabaseManager & Migrations', () => {
    it('should initialize and migrate database to the latest schema version', () => {
      const db = dbManager.getDatabase();
      const versionRow = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };

      expect(versionRow).toBeDefined();
      expect(versionRow.value).toBe('2'); // Matches migration version 2
    });
  });

  describe('FolderMappingRepository', () => {
    let mappingRepository: SQLiteFolderMappingRepository;

    beforeEach(() => {
      mappingRepository = new SQLiteFolderMappingRepository(() => dbManager.getDatabase());
    });

    const createDummyMapping = (overrides?: Partial<FolderMapping>): FolderMapping => ({
      id: crypto.randomUUID(),
      localFolderPath: `/users/test/local-${crypto.randomUUID()}`,
      driveFolderPath: `/drive/test/drive-${crypto.randomUUID()}`,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    });

    it('should create and retrieve folder mappings', async () => {
      const mapping = createDummyMapping();
      await mappingRepository.create(mapping);

      const foundById = await mappingRepository.findById(mapping.id);
      expect(foundById).toEqual(mapping);

      const foundByLocal = await mappingRepository.findByLocalFolderPath(mapping.localFolderPath);
      expect(foundByLocal).toEqual(mapping);

      const foundByDrive = await mappingRepository.findByDriveFolderPath(mapping.driveFolderPath);
      expect(foundByDrive).toEqual(mapping);
    });

    it('should update folder mapping fields', async () => {
      const mapping = createDummyMapping();
      await mappingRepository.create(mapping);

      const updatedMapping: FolderMapping = {
        ...mapping,
        status: 'LOCAL_MISSING',
        updatedAt: new Date().toISOString(),
      };

      await mappingRepository.update(updatedMapping);
      const found = await mappingRepository.findById(mapping.id);
      expect(found?.status).toBe('LOCAL_MISSING');
      expect(found?.updatedAt).toBe(updatedMapping.updatedAt);
    });

    it('should list all folder mappings', async () => {
      const mapping1 = createDummyMapping();
      const mapping2 = createDummyMapping();

      await mappingRepository.create(mapping1);
      await mappingRepository.create(mapping2);

      const list = await mappingRepository.list();
      expect(list.length).toBe(2);
      expect(list).toContainEqual(mapping1);
      expect(list).toContainEqual(mapping2);
    });

    it('should delete folder mappings', async () => {
      const mapping = createDummyMapping();
      await mappingRepository.create(mapping);

      await mappingRepository.delete(mapping.id);
      const found = await mappingRepository.findById(mapping.id);
      expect(found).toBeNull();
    });
  });

  describe('DocumentRepository', () => {
    let documentRepository: SQLiteDocumentRepository;
    let mappingRepository: SQLiteFolderMappingRepository;

    beforeEach(() => {
      documentRepository = new SQLiteDocumentRepository(() => dbManager.getDatabase());
      mappingRepository = new SQLiteFolderMappingRepository(() => dbManager.getDatabase());
    });

    const createDummyDocument = (overrides?: Partial<Document>): Document => ({
      id: crypto.randomUUID(),
      drivePath: `Drive/My Drive/file-${crypto.randomUUID()}.txt`,
      localOriginalPath: `/local/path/file-${crypto.randomUUID()}.txt`,
      driveHash: `hash-${crypto.randomUUID()}`,
      localHash: `hash-${crypto.randomUUID()}`,
      driveModifiedTime: new Date().toISOString(),
      localModifiedTime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpened: null,
      status: 'LINKED',
      metadata: { size: 1024, mimeType: 'text/plain' },
      folderMappingId: null,
      ...overrides,
    });

    it('should create and retrieve documents by different keys', async () => {
      const doc = createDummyDocument();
      await documentRepository.create(doc);

      const foundById = await documentRepository.findById(doc.id);
      expect(foundById).toEqual(doc);

      const foundByDrivePath = await documentRepository.findByDrivePath(doc.drivePath);
      expect(foundByDrivePath).toEqual(doc);

      const foundByLocalPath = await documentRepository.findByLocalOriginalPath(doc.localOriginalPath!);
      expect(foundByLocalPath).toEqual(doc);

      const foundByHash = await documentRepository.findByDriveHash(doc.driveHash!);
      expect(foundByHash).toEqual([doc]);
    });

    it('should update document properties', async () => {
      const doc = createDummyDocument();
      await documentRepository.create(doc);

      const updatedDoc: Document = {
        ...doc,
        status: 'CONFLICT',
        metadata: { ...doc.metadata, customKey: 'customVal' },
        updatedAt: new Date().toISOString(),
      };

      await documentRepository.update(updatedDoc);
      const found = await documentRepository.findById(doc.id);
      expect(found?.status).toBe('CONFLICT');
      expect(found?.metadata).toEqual({ size: 1024, mimeType: 'text/plain', customKey: 'customVal' });
    });

    it('should filter documents by folder mapping ID', async () => {
      const mapping = {
        id: crypto.randomUUID(),
        localFolderPath: '/local/folder',
        driveFolderPath: '/drive/folder',
        status: 'ACTIVE' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await mappingRepository.create(mapping);

      const doc1 = createDummyDocument({ folderMappingId: mapping.id });
      const doc2 = createDummyDocument({ folderMappingId: null });

      await documentRepository.create(doc1);
      await documentRepository.create(doc2);

      const mappedDocs = await documentRepository.listByFolderMappingId(mapping.id);
      expect(mappedDocs.length).toBe(1);
      expect(mappedDocs[0].id).toBe(doc1.id);
    });

    it('should delete documents', async () => {
      const doc = createDummyDocument();
      await documentRepository.create(doc);

      await documentRepository.delete(doc.id);
      const found = await documentRepository.findById(doc.id);
      expect(found).toBeNull();
    });
  });
});
