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

Indexes đề xuất:
- `idx_documents_drivePath` (UNIQUE)
- `idx_documents_localOriginalPath`
- `idx_documents_driveHash`
- `idx_documents_status`

## Migration strategy

Dùng versioned migration files trong `packages/database/migrations/`.
Mỗi migration là 1 transaction, có rollback rõ ràng. App lưu
`schema_version` trong bảng `meta`.

## Transaction rules

- Mọi thao tác ghi (write) từ Watcher hoặc Import Service phải nằm trong
  1 transaction để đảm bảo crash-safe.
- Đọc (read) không cần transaction trừ khi cần snapshot nhất quán nhiều
  bảng.
