export const initialMigration = {
  version: 1,
  up: `
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS folder_mappings (
      id TEXT PRIMARY KEY,
      localFolderPath TEXT NOT NULL,
      driveFolderPath TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      drivePath TEXT NOT NULL,
      localOriginalPath TEXT,
      driveHash TEXT,
      localHash TEXT,
      driveModifiedTime TEXT,
      localModifiedTime TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastOpened TEXT,
      status TEXT NOT NULL,
      metadata TEXT NOT NULL,
      folderMappingId TEXT,
      FOREIGN KEY (folderMappingId) REFERENCES folder_mappings(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_folder_mappings_localFolderPath ON folder_mappings(localFolderPath);
    CREATE INDEX IF NOT EXISTS idx_folder_mappings_driveFolderPath ON folder_mappings(driveFolderPath);
    CREATE INDEX IF NOT EXISTS idx_folder_mappings_status ON folder_mappings(status);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_drivePath ON documents(drivePath);
    CREATE INDEX IF NOT EXISTS idx_documents_localOriginalPath ON documents(localOriginalPath);
    CREATE INDEX IF NOT EXISTS idx_documents_driveHash ON documents(driveHash);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_documents_folderMappingId ON documents(folderMappingId);

    INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '0');
  `,
  down: `
    DROP INDEX IF EXISTS idx_documents_folderMappingId;
    DROP INDEX IF EXISTS idx_documents_status;
    DROP INDEX IF EXISTS idx_documents_driveHash;
    DROP INDEX IF EXISTS idx_documents_localOriginalPath;
    DROP INDEX IF EXISTS idx_documents_drivePath;
    DROP INDEX IF EXISTS idx_folder_mappings_status;
    DROP INDEX IF EXISTS idx_folder_mappings_driveFolderPath;
    DROP INDEX IF EXISTS idx_folder_mappings_localFolderPath;

    DROP TABLE IF EXISTS documents;
    DROP TABLE IF EXISTS folder_mappings;
    DROP TABLE IF EXISTS meta;
  `
}
