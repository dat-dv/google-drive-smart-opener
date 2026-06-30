import { Document, FolderMapping, OfflineTask } from '@shared/types';

/**
 * Port interface for Document data access operations.
 * Decouples the domain layer from specific database implementations (e.g. SQLite).
 */
export interface DocumentRepository {
  /**
   * Retrieves a document by its unique identifier.
   */
  findById(id: string): Promise<Document | null>;

  /**
   * Finds a document by its Google Drive path.
   * Path index is unique, ensuring rapid lookups.
   */
  findByDrivePath(drivePath: string): Promise<Document | null>;

  /**
   * Finds a document by its local original path.
   */
  findByLocalOriginalPath(localOriginalPath: string): Promise<Document | null>;

  /**
   * Finds documents matching a Google Drive checksum hash.
   * Used for deduplication and matching file identity across path changes.
   */
  findByDriveHash(driveHash: string): Promise<Document[]>;

  /**
   * Persists a new document record.
   */
  create(document: Document): Promise<void>;

  /**
   * Updates an existing document record.
   */
  update(document: Document): Promise<void>;

  /**
   * Deletes a document record by ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Lists all documents in the system.
   */
  list(): Promise<Document[]>;

  /**
   * Lists all documents belonging to a specific folder mapping.
   */
  listByFolderMappingId(folderMappingId: string): Promise<Document[]>;
}

/**
 * Port interface for FolderMapping data access operations.
 */
export interface FolderMappingRepository {
  /**
   * Retrieves a folder mapping by its unique identifier.
   */
  findById(id: string): Promise<FolderMapping | null>;

  /**
   * Finds a mapping by the exact local folder path.
   * Local folder path mappings are unique.
   */
  findByLocalFolderPath(localFolderPath: string): Promise<FolderMapping | null>;

  /**
   * Finds a mapping by the Google Drive folder path.
   */
  findByDriveFolderPath(driveFolderPath: string): Promise<FolderMapping | null>;

  /**
   * Persists a new folder mapping.
   */
  create(mapping: FolderMapping): Promise<void>;

  /**
   * Updates an existing folder mapping.
   */
  update(mapping: FolderMapping): Promise<void>;

  /**
   * Deletes a folder mapping.
   */
  delete(id: string): Promise<void>;

  /**
   * Lists all folder mappings.
   */
  list(): Promise<FolderMapping[]>;
}

/**
 * Port interface for OfflineTask data access operations.
 */
export interface OfflineTaskRepository {
  /**
   * Persists a new offline task.
   */
  create(task: OfflineTask): Promise<void>;

  /**
   * Updates an offline task.
   */
  update(task: OfflineTask): Promise<void>;

  /**
   * Deletes an offline task.
   */
  delete(id: string): Promise<void>;

  /**
   * Lists all offline tasks with PENDING status.
   */
  listPending(): Promise<OfflineTask[]>;
}
