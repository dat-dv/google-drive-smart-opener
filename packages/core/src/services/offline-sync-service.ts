import { Document, OfflineTask } from '@shared/types';
import { DocumentRepository, OfflineTaskRepository } from '../ports/repositories';
import { CloudProvider } from '../ports/cloud-provider';

/**
 * Service to manage offline tasks and synchronize them when the network status changes.
 */
export class OfflineSyncService {
  private readonly taskRepo: OfflineTaskRepository;
  private readonly docRepo: DocumentRepository;
  private readonly cloudProvider: CloudProvider;
  private isSyncing = false;

  constructor(
    taskRepo: OfflineTaskRepository,
    docRepo: DocumentRepository,
    cloudProvider: CloudProvider
  ) {
    this.taskRepo = taskRepo;
    this.docRepo = docRepo;
    this.cloudProvider = cloudProvider;
  }

  /**
   * Triggers synchronization of all pending offline tasks.
   */
  public async sync(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const pendingTasks: OfflineTask[] = await this.taskRepo.listPending();
      for (const task of pendingTasks) {
        try {
          if (task.type === 'IMPORT_FILE') {
            const { localFilePath, targetDriveFolder, documentId } = JSON.parse(task.payload);
            
            // Execute import file into Cloud Drive mirror
            const doc: Document = await this.cloudProvider.importFile(localFilePath, targetDriveFolder);

            // Update the existing placeholder document in SQLite index
            const placeholder = await this.docRepo.findById(documentId);
            if (placeholder) {
              placeholder.drivePath = doc.drivePath;
              placeholder.driveHash = doc.driveHash;
              placeholder.localHash = doc.localHash;
              placeholder.status = 'LINKED';
              placeholder.updatedAt = new Date().toISOString();
              // Clean offline flag
              if (placeholder.metadata) {
                delete placeholder.metadata.offlinePending;
              }
              await this.docRepo.update(placeholder);
            } else {
              await this.docRepo.create(doc);
            }
          } else if (task.type === 'SYNC_STATUS') {
            const { documentId, status, localOriginalPath, localHash } = JSON.parse(task.payload);
            const doc = await this.docRepo.findById(documentId);
            if (doc) {
              doc.status = status;
              if (localOriginalPath !== undefined) doc.localOriginalPath = localOriginalPath;
              if (localHash !== undefined) doc.localHash = localHash;
              doc.updatedAt = new Date().toISOString();
              await this.docRepo.update(doc);
            }
          }

          task.status = 'COMPLETED';
          await this.taskRepo.update(task);
        } catch (taskErr) {
          console.error(`[OfflineSync] Sync failed for task ${task.id}:`, taskErr);
          task.status = 'FAILED';
          await this.taskRepo.update(task);
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }
}
