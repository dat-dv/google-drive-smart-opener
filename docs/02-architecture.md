# Architecture

Áp dụng **Clean Architecture**, chia layer rõ ràng, mọi phụ thuộc đi vào
trong (domain ở trung tâm, không phụ thuộc framework).

## Modules

- **App** — entrypoint, wiring giữa các layer.
- **Main Process** (Electron) — vòng đời app, IPC, file interception (qua
  macOS `LSSetDefaultRoleHandlerForContentType` / custom URL scheme /
  Launch Services), tích hợp OS-level.
- **Renderer** (React) — UI: Recent Documents, Status, Settings, Conflicts.
- **Database** — SQLite (better-sqlite3), migration, transaction.
- **Repository** — lớp truy xuất dữ liệu (Document Repository), che giấu
  chi tiết SQL khỏi use case.
- **Document Service** — nghiệp vụ cốt lõi: lookup, link, resolve.
- **Drive Scanner** — quét đệ quy Google Drive folder (chỉ chạy khi cần).
- **Drive Watcher** — chokidar watcher cho Drive folder + local path.
- **Conflict Resolver** — phát hiện & xử lý xung đột theo R9.
- **Mapping Service** — quản lý `FolderMapping` (CRUD ánh xạ thư mục local
  ↔ Drive theo R14), đệ quy áp dụng thay đổi cấu trúc thư mục theo chính
  sách R15, sinh `Document` con khi mapping mới được thêm hoặc folder con
  được phát hiện qua watcher/scan.
- **Import Service** — copy file vào `My Drive/Other`, xử lý trùng tên.
- **Search Engine** — tìm theo filename / checksum / metadata, để ngỏ chỗ
  cho semantic search sau này.
- **File Opener** — gọi OS mở file (`shell.openPath` trong Electron).
- **Settings** — đọc/ghi cấu hình user (folder, conflict strategy, theme...).
- **Logger** — structured logging, ghi log lỗi/sự kiện watcher.
- **IPC** — giao tiếp Main ↔ Renderer (typed channels).
- **Utilities** — helper dùng chung (hash, path, filename dedup...).

## CloudProvider abstraction

```ts
interface CloudProvider {
  search(query: SearchQuery): Promise<Document[]>;
  import(file: string): Promise<Document>;
  open(documentId: string): Promise<void>;
  move(documentId: string, folder: string): Promise<void>;
  watch(): Promise<void>;
}
```

Implementations:
- `GoogleDriveProvider` (giai đoạn 1 — duy nhất cần implement ngay)
- `DropboxProvider` (tương lai)
- `OneDriveProvider` (tương lai)
- `iCloudProvider` (tương lai)

Toàn bộ Document Service / Use Cases chỉ phụ thuộc vào interface
`CloudProvider`, không bao giờ import trực tiếp `GoogleDriveProvider`.

## FolderMapping (mapping cấp thư mục)

```ts
interface FolderMapping {
  id: string;          // UUID
  localFolderPath: string;
  driveFolderPath: string;
  status: 'ACTIVE' | 'DRIVE_DELETED' | 'LOCAL_MISSING' | 'UNLINKED';
  createdAt: string;
  updatedAt: string;
}
```

`FolderMapping` là đơn vị mà user thao tác trên Mapping Tree UI (R14).
Mỗi `Document` (cấp file) thuộc về đúng 1 `FolderMapping` (qua
`folderMappingId`, xem `docs/03-database.md`). Khi `Mapping Service` phát
hiện thay đổi cấu trúc thư mục phía Drive, nó áp dụng chính sách "Drive là
master cho cấu trúc thư mục, local là soft reflection" đã mô tả ở R15:
cập nhật `drivePath` của toàn bộ `Document`/`FolderMapping` con, nhưng
không bao giờ tự ý rename/move/delete phía local.

## Layer dependency rule

```
apps/desktop (Main + Renderer)
        │  depends on
        ▼
packages/core (domain, usecases, services)
        │  depends on (interfaces only)
        ▼
packages/database, packages/shared (implementations / infra)
```

Domain (`packages/core/domain`) không được import bất kỳ thứ gì từ
Electron, SQLite, hay Node fs trực tiếp — chỉ làm việc qua interface.
