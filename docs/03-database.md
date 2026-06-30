# Database Schema (SQLite via better-sqlite3)

## Table: documents

| Column            | Type      | Notes                                   |
|-------------------|-----------|------------------------------------------|
| id                | TEXT (PK) | UUID v4                                   |
| drivePath         | TEXT      | Đường dẫn tới bản trên Google Drive       |
| localOriginalPath | TEXT      | Đường dẫn local gốc (nullable)            |
| driveHash         | TEXT      | Checksum bản Drive                        |
| localHash         | TEXT      | Checksum bản local                        |
| driveModifiedTime | TEXT      | ISO timestamp                             |
| localModifiedTime | TEXT      | ISO timestamp                             |
| createdAt         | TEXT      | ISO timestamp                             |
| updatedAt         | TEXT      | ISO timestamp                             |
| lastOpened        | TEXT      | ISO timestamp                             |
| status            | TEXT      | LINKED \| LOCAL_DELETED \| DRIVE_DELETED \| CONFLICT |
| metadata          | TEXT      | JSON blob (size, mimeType, provider, ...) |
| folderMappingId   | TEXT      | FK → folder_mappings.id (nullable)        |

Indexes đề xuất:
- `idx_documents_drivePath` (UNIQUE)
- `idx_documents_localOriginalPath`
- `idx_documents_driveHash`
- `idx_documents_status`
- `idx_documents_folderMappingId`

## Table: folder_mappings

| Column          | Type      | Notes                                       |
|-----------------|-----------|----------------------------------------------|
| id              | TEXT (PK) | UUID v4                                       |
| localFolderPath | TEXT      | Đường dẫn folder local                        |
| driveFolderPath | TEXT      | Đường dẫn folder trên Google Drive            |
| status          | TEXT      | ACTIVE \| DRIVE_DELETED \| LOCAL_MISSING \| UNLINKED |
| createdAt       | TEXT      | ISO timestamp                                 |
| updatedAt       | TEXT      | ISO timestamp                                 |

Indexes đề xuất:
- `idx_folder_mappings_localFolderPath` (UNIQUE)
- `idx_folder_mappings_driveFolderPath`
- `idx_folder_mappings_status`

Mỗi `Document` thuộc về tối đa 1 `FolderMapping` (qua `folderMappingId`).
Document được tạo qua case "DATABASE MISS" (không thuộc mapping nào sẵn
có) sẽ có `folderMappingId = NULL` cho tới khi user gộp nó vào một
mapping cụ thể từ UI (hoặc app tự gán nếu drivePath nằm trong phạm vi của
một FolderMapping đã có).

## Migration strategy

Dùng versioned migration files trong `packages/database/migrations/`.
Mỗi migration là 1 transaction, có rollback rõ ràng. App lưu
`schema_version` trong bảng `meta`.

## Transaction rules

- Mọi thao tác ghi (write) từ Watcher hoặc Import Service phải nằm trong
  1 transaction để đảm bảo crash-safe.
- Đọc (read) không cần transaction trừ khi cần snapshot nhất quán nhiều
  bảng.
