import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { OpenDocumentUseCase } from '../usecases/open-document';
import { OfflineSyncService } from '../services/offline-sync-service';
import { DocumentRepository, OfflineTaskRepository } from '../ports/repositories';
import { CloudProvider } from '../ports/cloud-provider';
import { UserInteractor } from '../ports/user-interactor';
import { Document, OfflineTask } from '@shared/types';

vi.mock('fs', () => {
  return {
    existsSync: vi.fn(),
    statSync: vi.fn(),
  };
});

vi.mock('@shared', () => {
  return {
    calculateFileMd5: vi.fn(() => Promise.resolve('mock-local-hash')),
  };
});

describe('M9 Offline Cache & Sync Integration', () => {
  let docRepo: DocumentRepository;
  let taskRepo: OfflineTaskRepository;
  let cloudProvider: CloudProvider;
  let interactor: UserInteractor;
  let useCase: OpenDocumentUseCase;

  const mockLocalPath = '/Users/test/Workspace/report.docx';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock existsSync to return true for source file
    vi.mocked(fs.existsSync).mockImplementation((p) => p === mockLocalPath);

    vi.mocked(fs.statSync).mockReturnValue({
      size: 1024,
    } as fs.Stats);

    // Repositories mock
    const docs = new Map<string, Document>();
    docRepo = {
      findById: vi.fn(async (id) => docs.get(id) || null),
      findByDrivePath: vi.fn(),
      findByLocalOriginalPath: vi.fn(async () => null),
      findByDriveHash: vi.fn(),
      create: vi.fn(async (doc) => { docs.set(doc.id, doc); }),
      update: vi.fn(async (doc) => { docs.set(doc.id, doc); }),
      delete: vi.fn(),
      list: vi.fn(),
      listByFolderMappingId: vi.fn(),
    };

    const tasks: OfflineTask[] = [];
    taskRepo = {
      create: vi.fn(async (t) => { tasks.push(t); }),
      update: vi.fn(async (t) => {
        const idx = tasks.findIndex((x) => x.id === t.id);
        if (idx !== -1) tasks[idx] = t;
      }),
      delete: vi.fn(),
      listPending: vi.fn(async () => tasks.filter((t) => t.status === 'PENDING')),
    };

    cloudProvider = {
      search: vi.fn(),
      scanFolder: vi.fn(),
      resolveLocalPath: vi.fn((p) => `/mock/drive/${p}`),
      getDriveRootPath: vi.fn(() => '/mock/drive'),
      importFile: vi.fn(async (local, target) => ({
        id: 'real-drive-id',
        drivePath: 'My Drive/Other/report.docx',
        localOriginalPath: local,
        driveHash: 'real-drive-hash',
        localHash: 'mock-local-hash',
        driveModifiedTime: new Date().toISOString(),
        localModifiedTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOpened: null,
        status: 'LINKED',
        metadata: { size: 1024, provider: 'google-drive' },
        folderMappingId: null,
      })),
      openFile: vi.fn(),
      moveFile: vi.fn(),
    };

    interactor = {
      promptSingleCandidate: vi.fn(),
      promptMultipleCandidates: vi.fn(),
      promptConflict: vi.fn(),
    };

    useCase = new OpenDocumentUseCase(docRepo, cloudProvider, interactor, taskRepo);
  });

  it('should open file locally and queue import task when offline during a database miss', async () => {
    // GIVEN we are offline
    useCase.setOnlineStatus(false);

    // WHEN we open a document
    const result = await useCase.execute(mockLocalPath);

    // THEN it should be opened
    expect(result.type).toBe('OPENED');
    if (result.type !== 'OPENED') return;

    // Check placeholder was created
    expect(docRepo.create).toHaveBeenCalled();
    expect(result.document.status).toBe('UNLINKED');
    expect(result.document.metadata.offlinePending).toBe(true);

    // Check native file open called on the local path directly
    expect(cloudProvider.openFile).toHaveBeenCalledWith(mockLocalPath);

    // Check task queued
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'IMPORT_FILE',
        status: 'PENDING',
      })
    );
  });

  it('should process pending tasks and synchronize metadata once network is online', async () => {
    // 1. Trigger offline database miss to queue task
    useCase.setOnlineStatus(false);
    const openRes = await useCase.execute(mockLocalPath);
    expect(openRes.type).toBe('OPENED');
    if (openRes.type !== 'OPENED') return;

    const docId = openRes.document.id;

    // 2. Instantiate OfflineSyncService
    const syncService = new OfflineSyncService(taskRepo, docRepo, cloudProvider);

    // 3. Trigger sync (network back online)
    await syncService.sync();

    // Check task completed
    const pendingTasks = await taskRepo.listPending();
    expect(pendingTasks.length).toBe(0);

    // Check document status upgraded to LINKED
    const updatedDoc = await docRepo.findById(docId);
    expect(updatedDoc).not.toBeNull();
    expect(updatedDoc?.status).toBe('LINKED');
    expect(updatedDoc?.drivePath).toBe('My Drive/Other/report.docx');
    expect(updatedDoc?.driveHash).toBe('real-drive-hash');
    expect(updatedDoc?.metadata.offlinePending).toBeUndefined();
  });
});
