import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseManager } from '@database';
import { SQLiteDocumentRepository } from '@database';
import { GoogleDriveProvider } from '../services/google-drive-provider';
import { OpenDocumentUseCase } from '../usecases/open-document';
import { Document } from '@shared';
import * as crypto from 'crypto';

// Mock exec to prevent real macOS file open triggers during testing
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd, cb: (err: Error | null) => void) => {
    cb(null);
  }),
}));

describe('OpenDocumentUseCase Integration Tests', () => {
  let tempDir: string;
  let localWorkspaceDir: string;
  let driveWorkspaceDir: string;
  
  let dbManager: DatabaseManager;
  let docRepo: SQLiteDocumentRepository;
  let provider: GoogleDriveProvider;
  let useCase: OpenDocumentUseCase;

  beforeEach(() => {
    // Create clean directories for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-usecase-test-'));
    localWorkspaceDir = path.join(tempDir, 'local');
    driveWorkspaceDir = path.join(tempDir, 'drive');
    fs.mkdirSync(localWorkspaceDir);
    fs.mkdirSync(driveWorkspaceDir);

    // Initialize DB Manager
    dbManager = new DatabaseManager(':memory:');
    dbManager.connect();
    docRepo = new SQLiteDocumentRepository(() => dbManager.getDatabase());

    // Initialize Drive Provider targeting drive workspace
    provider = new GoogleDriveProvider(driveWorkspaceDir);

    // Initialize Use Case
    useCase = new OpenDocumentUseCase(docRepo, provider);
  });

  afterEach(() => {
    dbManager.disconnect();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  const createDummyDocument = (overrides?: Partial<Document>): Document => ({
    id: crypto.randomUUID(),
    drivePath: `My Drive/file-${crypto.randomUUID()}.txt`,
    localOriginalPath: null,
    driveHash: null,
    localHash: null,
    driveModifiedTime: null,
    localModifiedTime: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastOpened: null,
    status: 'LINKED',
    metadata: {},
    folderMappingId: null,
    ...overrides,
  });

  it('should return LOCAL_FILE_NOT_FOUND when local file does not exist', async () => {
    const result = await useCase.execute(path.join(localWorkspaceDir, 'non-existent.txt'));
    expect(result.type).toBe('LOCAL_FILE_NOT_FOUND');
  });

  describe('Database Hit Workflow (R2)', () => {
    it('should open canonical Drive file and update lastOpened on database hit', async () => {
      const localPath = path.join(localWorkspaceDir, 'report.docx');
      const drivePath = 'My Drive/canonical_report.docx';
      const driveAbsPath = path.join(driveWorkspaceDir, drivePath);

      // Create physical files
      fs.writeFileSync(localPath, 'Local content');
      fs.mkdirSync(path.dirname(driveAbsPath), { recursive: true });
      fs.writeFileSync(driveAbsPath, 'Drive content');

      // Create DB link record
      const doc = createDummyDocument({
        drivePath,
        localOriginalPath: localPath,
        status: 'LINKED',
      });
      await docRepo.create(doc);

      const result = await useCase.execute(localPath);
      expect(result.type).toBe('OPENED');
      
      if (result.type === 'OPENED') {
        expect(result.document.id).toBe(doc.id);
        expect(result.document.lastOpened).not.toBeNull();

        // Verify database state updated
        const updated = await docRepo.findById(doc.id);
        expect(updated?.lastOpened).not.toBeNull();
      }
    });

    it('should set status to DRIVE_DELETED if canonical Drive file is missing', async () => {
      const localPath = path.join(localWorkspaceDir, 'report.docx');
      const drivePath = 'My Drive/deleted_report.docx';

      // Create only local file
      fs.writeFileSync(localPath, 'Local content');

      // Create DB link record
      const doc = createDummyDocument({
        drivePath,
        localOriginalPath: localPath,
        status: 'LINKED',
      });
      await docRepo.create(doc);

      const result = await useCase.execute(localPath);
      expect(result.type).toBe('OPENED'); // Usecase returns OPENED state but internally marks state
      
      const updated = await docRepo.findById(doc.id);
      expect(updated?.status).toBe('DRIVE_DELETED');
    });
  });

  describe('Database Miss Workflow (R3)', () => {
    it('should return MISS_NO_CANDIDATES when file is not indexed and no name match exists on Drive', async () => {
      const localPath = path.join(localWorkspaceDir, 'unique-document.pdf');
      fs.writeFileSync(localPath, 'Unique PDF Data');

      const result = await useCase.execute(localPath);
      expect(result.type).toBe('MISS_NO_CANDIDATES');
    });

    it('should return MISS_SINGLE_CANDIDATE when exactly one name matching candidate exists on Drive', async () => {
      const localPath = path.join(localWorkspaceDir, 'budget.xlsx');
      fs.writeFileSync(localPath, 'Budget local data');

      const drivePath = 'My Drive/Finances/budget.xlsx';
      const driveAbsPath = path.join(driveWorkspaceDir, drivePath);
      fs.mkdirSync(path.dirname(driveAbsPath), { recursive: true });
      fs.writeFileSync(driveAbsPath, 'Budget drive data (different)');

      const result = await useCase.execute(localPath);
      expect(result.type).toBe('MISS_SINGLE_CANDIDATE');
      
      if (result.type === 'MISS_SINGLE_CANDIDATE') {
        expect(result.candidate.drivePath).toBe(drivePath);
      }
    });

    it('should return MISS_SINGLE_CANDIDATE identifying hash-matching file even among name matches', async () => {
      const localPath = path.join(localWorkspaceDir, 'doc.txt');
      fs.writeFileSync(localPath, 'Common text content'); // MD5 hash matches

      // Create multiple files on Drive with same name, but only one matches content hash
      const drivePathMatch = 'My Drive/Docs/doc.txt';
      const drivePathOther = 'My Drive/Archive/doc.txt';
      const driveAbsMatch = path.join(driveWorkspaceDir, drivePathMatch);
      const driveAbsOther = path.join(driveWorkspaceDir, drivePathOther);

      fs.mkdirSync(path.dirname(driveAbsMatch), { recursive: true });
      fs.mkdirSync(path.dirname(driveAbsOther), { recursive: true });
      fs.writeFileSync(driveAbsMatch, 'Common text content'); // Same MD5
      fs.writeFileSync(driveAbsOther, 'Other text content'); // Different MD5

      const result = await useCase.execute(localPath);
      expect(result.type).toBe('MISS_SINGLE_CANDIDATE');
      
      if (result.type === 'MISS_SINGLE_CANDIDATE') {
        expect(result.candidate.drivePath).toBe(drivePathMatch);
      }
    });

    it('should return MISS_MULTIPLE_CANDIDATES when multiple name matches exist with no hash match', async () => {
      const localPath = path.join(localWorkspaceDir, 'notes.txt');
      fs.writeFileSync(localPath, 'Local notes');

      // Create two candidates on Drive with same name but different content
      const drivePath1 = 'My Drive/NotesA/notes.txt';
      const drivePath2 = 'My Drive/NotesB/notes.txt';
      const driveAbs1 = path.join(driveWorkspaceDir, drivePath1);
      const driveAbs2 = path.join(driveWorkspaceDir, drivePath2);

      fs.mkdirSync(path.dirname(driveAbs1), { recursive: true });
      fs.mkdirSync(path.dirname(driveAbs2), { recursive: true });
      fs.writeFileSync(driveAbs1, 'Drive Notes A content');
      fs.writeFileSync(driveAbs2, 'Drive Notes B content');

      const result = await useCase.execute(localPath);
      expect(result.type).toBe('MISS_MULTIPLE_CANDIDATES');
      
      if (result.type === 'MISS_MULTIPLE_CANDIDATES') {
        expect(result.candidates.length).toBe(2);
        const paths = result.candidates.map((c) => c.drivePath);
        expect(paths).toContain(drivePath1);
        expect(paths).toContain(drivePath2);
      }
    });
  });
});
