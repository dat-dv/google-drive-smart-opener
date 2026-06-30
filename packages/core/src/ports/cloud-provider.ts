import { Document } from '@shared/types';

/**
 * Filter criteria for performing lookups on cloud-backed documents.
 */
export interface SearchQuery {
  /**
   * Filename to search for (including extension, e.g., 'report.xlsx').
   */
  filename?: string;
  
  /**
   * File size in bytes. Used to match file identity during database misses.
   */
  fileSize?: number;
  
  /**
   * Hash checksum (MD5) of the document content.
   */
  hash?: string;
}

/**
 * Port interface for Cloud Providers (e.g. Google Drive, OneDrive, iCloud).
 * decouples the core file manager from specific cloud API or client integrations.
 */
export interface CloudProvider {
  /**
   * Performs a lookup inside the cloud store based on name, size, or checksum.
   * Required for R3 database-miss searching.
   */
  search(query: SearchQuery): Promise<Document[]>;

  /**
   * Scans a specific subfolder inside the drive storage.
   * Used for indexing and synchronizing mapping folder structures (R14/R15).
   */
  scanFolder(driveSubfolderPath: string): Promise<Document[]>;

  /**
   * Resolves a relative drive path (e.g. 'My Drive/report.xlsx') 
   * to a fully qualified absolute path on the local disk.
   */
  resolveLocalPath(drivePath: string): string;

  /**
   * Returns the root folder path of the local cloud drive directory.
   */
  getDriveRootPath(): string;

  /**
   * Imports a local file into the cloud storage.
   * Returns the newly created Document metadata.
   */
  importFile(localFilePath: string, targetDriveFolder: string): Promise<Document>;

  /**
   * Opens a document using the OS-specific file association.
   * When useDriveApp is true, opens with the Google Drive desktop application.
   */
  openFile(drivePath: string, useDriveApp?: boolean): Promise<void>;

  /**
   * Moves a cloud document to another folder inside the cloud storage.
   */
  moveFile(drivePath: string, targetDriveFolder: string): Promise<void>;
}
