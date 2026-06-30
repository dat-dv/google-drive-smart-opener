/**
 * Status of a Document, tracking its link state between local and Drive.
 */
export type DocumentStatus = 'LINKED' | 'LOCAL_DELETED' | 'DRIVE_DELETED' | 'CONFLICT' | 'UNLINKED';

/**
 * Metadata associated with a Document, stored as JSON in the database.
 */
export interface DocumentMetadata {
  size?: number;
  mimeType?: string;
  provider?: string;
  [key: string]: unknown;
}

/**
 * Core Document model representing a file managed by the system.
 * Linkage is tracked by localOriginalPath and drivePath.
 */
export interface Document {
  id: string;
  drivePath: string;
  localOriginalPath: string | null;
  driveHash: string | null;
  localHash: string | null;
  driveModifiedTime: string | null;
  localModifiedTime: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpened: string | null;
  status: DocumentStatus;
  metadata: DocumentMetadata;
  folderMappingId: string | null;
}

/**
 * Status of a FolderMapping.
 */
export type FolderMappingStatus = 'ACTIVE' | 'DRIVE_DELETED' | 'LOCAL_MISSING' | 'UNLINKED';

/**
 * FolderMapping maps a local folder path to a Google Drive folder path.
 * All files inside mapped local folders are automatically indexed and linked.
 */
export interface FolderMapping {
  id: string;
  localFolderPath: string;
  driveFolderPath: string;
  status: FolderMappingStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * OfflineTask represents a cloud synchronization operation cached offline.
 */
export interface OfflineTask {
  id: string;
  type: 'IMPORT_FILE' | 'SYNC_STATUS';
  payload: string; // JSON string payload
  createdAt: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}
