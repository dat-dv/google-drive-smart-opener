# Requirements

## R1. Intercept file open
Khi user mở file bất kỳ (double click / Finder / Spotlight), ứng dụng phải
chặn được hành động mở mặc định của macOS và xử lý trước.

## R2. Document lookup
- Tra cứu file đang mở trong SQLite database nội bộ.
- Nếu tìm thấy → mở bản trên Google Drive (`drivePath`), không mở bản local.
- Nếu không tìm thấy → tiến hành quy trình import.

## R3. Database-miss search
Khi không có record trong DB, tìm kiếm đệ quy trong
`~/Google Drive/My Drive` theo: filename, file size, checksum, metadata.

### R3.1 — Tìm thấy đúng 1 candidate
Hiển thị dialog: "A similar document already exists inside Google Drive."
- Option "Open Google Drive Version" → tạo record DB, mở bản Drive.
- Option "Import As New Copy" → copy vào `My Drive/Other`, tạo record DB,
  mở bản import.

### R3.2 — Tìm thấy nhiều candidate
Hiển thị picker cho user chọn 1 trong các bản, hoặc chọn "Create New Copy".
Không bao giờ tự động quyết định thay user.

### R3.3 — Không tìm thấy candidate nào
- Copy file local vào `My Drive/Other`.
- Nếu trùng tên → tự động đổi tên `report (1).xlsx`, `report (2).xlsx`...
- Tạo record DB, mở bản import.

## R4. Source of truth
Sau khi import, Google Drive luôn là bản canonical. Lần mở sau luôn ưu
tiên bản Drive.

## R5. File watcher
- Theo dõi (watch) thư mục Google Drive: create, delete, rename, move,
  modify → tự động cập nhật SQLite index.
- Theo dõi luôn local original path (khi còn tồn tại).
- Không polling, dùng filesystem watcher (chokidar).

## R6. Rename
Khi file trên Drive bị đổi tên, cập nhật `drivePath` trong DB.
Document ID không bao giờ thay đổi.

## R7. Move
Khi file trên Drive bị di chuyển sang folder khác, cập nhật `drivePath`.

## R8. Delete
- Local bị xóa → status = `LOCAL_DELETED`.
- Drive bị xóa → status = `DRIVE_DELETED`.

## R9. Conflict detection
Nếu cả local và Drive cùng thay đổi sau khi đã link, không bao giờ
silently overwrite. Hiển thị dialog với các lựa chọn:
- Open Google Drive Version
- Open Local Version
- Replace Google Drive
- Replace Local
- Create New Copy
- Cancel

## R10. Performance
- Không quét đệ quy toàn bộ Google Drive mỗi lần mở file.
- Dùng SQLite index làm nguồn tra cứu chính.
- Chỉ quét đệ quy khi: lần chạy đầu tiên, rebuild thủ công, hoặc DB
  corrupt.

## R11. Non-functional
- Khởi động nhanh, tốn ít bộ nhớ.
- Không background polling, chỉ dùng filesystem watcher.
- Chịu được 100k+ file.
- Thread-safe, crash-safe, hỗ trợ DB transaction.

## R12. Extensibility
Toàn bộ logic giao tiếp cloud phải đi qua interface `CloudProvider` để dễ
dàng thêm provider mới (Dropbox, OneDrive, iCloud, Nextcloud).
