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

## R13. Background indexing service

Ứng dụng chạy như một **background app / menu bar app** (không phải app
phải mở UI mới hoạt động). Ngay khi máy khởi động (hoặc app được mở lần
đầu), service nền sẽ:

- Giữ một **index sống** (live index) trong SQLite, phản ánh trạng thái
  ánh xạ (mapping) giữa cây thư mục local và cây thư mục Google Drive.
- Watcher (R5) cập nhật liên tục index này, không cần user mở UI.
- UI (cửa sổ chính / menu bar popover) chỉ là "cửa sổ nhìn vào" index,
  không phải nguồn dữ liệu — đóng UI không dừng việc index.

## R14. Mapping Tree UI

Giao diện chính hiển thị dựa trên **cây thư mục đã ánh xạ** (mapped folder
tree), không chỉ là danh sách Recent Documents phẳng. Cây hiển thị song
song hai phía: nhánh local và nhánh Drive tương ứng cho mỗi mapping.

User có thể, ngay trên UI:

- **Thêm ánh xạ thủ công**: chọn 1 folder local + 1 folder trên Drive,
  tạo một `FolderMapping` mới. Mọi file bên trong (hiện có và phát sinh
  sau này) được tự động index theo mapping này.
- **Sửa ánh xạ**: đổi folder local hoặc folder Drive của một mapping đã
  có. Khi sửa, app re-index lại toàn bộ subtree liên quan (không cần
  rebuild toàn bộ DB).
- **Xoá ánh xạ**: gỡ liên kết folder local ↔ Drive. Xoá mapping KHÔNG xoá
  file vật lý ở bất kỳ phía nào — chỉ dừng theo dõi (unwatch) và đánh dấu
  các document con thuộc mapping đó là `UNLINKED` (xem R16), trừ khi user
  chọn tuỳ chọn "Xoá cả index document con" trong dialog xác nhận.

Mapping ở cấp **folder** (FolderMapping), tách biệt với mapping ở cấp
**file** (Document, đã có trong R1–R3). Một FolderMapping là cách khai
báo "thư mục local X tương ứng thư mục Drive Y", từ đó toàn bộ file con
được tự động tạo Document record khi phát hiện qua watcher/scan.

## R15. Drive-side folder structure thay đổi → chính sách đồng bộ local

Khi Google Drive (qua Drive Watcher ở R5) phát hiện cấu trúc thư mục phía
Drive thay đổi (rename folder, move folder, xoá folder), áp dụng nguyên
tắc: **Google Drive luôn là master cho cấu trúc thư mục (folder
structure)**, local là bản phản chiếu mềm (soft reflection) — vì local
folder thường không thực sự "đồng bộ" như Drive Desktop client.

Cụ thể:

- **Drive folder bị rename / move**:
  - Cập nhật `drivePath` cho mọi `Document` và `FolderMapping` con thuộc
    folder đó (tương tự R6/R7, nhưng áp dụng đệ quy cho cả cây con).
  - **Không** tự động rename/move folder local tương ứng. App chỉ cập
    nhật index + hiển thị cảnh báo nhẹ trên UI: "Drive folder đã đổi
    tên/đường dẫn, local folder gốc không còn khớp tên".
  - Lý do: local folder có thể đang được dùng bởi công cụ khác (git repo,
    project folder...), tự ý đổi tên/move có rủi ro phá vỡ workflow của
    user ngoài phạm vi app.
  - User có thể bấm "Đồng bộ tên local theo Drive" trên UI nếu muốn app
    rename folder local theo — đây là hành động **opt-in**, không tự động.

- **Drive folder bị xoá**:
  - Toàn bộ `Document` con chuyển status `DRIVE_DELETED` (R8).
  - `FolderMapping` chuyển status `DRIVE_DELETED`, vẫn giữ trong DB (không
    xoá record) để user có thể xem lịch sử và quyết định: "Xoá mapping
    hẳn" hoặc "Khôi phục" (nếu Drive vẫn còn trong Trash và provider hỗ
    trợ restore).
  - Local file/folder gốc **không bị xoá** theo. App chỉ đổi trạng thái
    hiển thị trên UI (folder hiện màu cảnh báo trong cây).

- **Local folder structure thay đổi** (ngược lại): áp dụng tương tự nhưng
  theo chiều ngược — local rename/move/delete **không tự động áp lên
  Drive**. Local là "điểm vào" (entry point) ban đầu, còn sau khi đã
  link, local chỉ còn vai trò tham chiếu lịch sử
  (`localOriginalPath`), không phải bản phải giữ đồng bộ activement.

Nguyên tắc tổng quát: **không bao giờ tự động rename/move/delete ở phía
ngược lại** chỉ vì một phía thay đổi cấu trúc thư mục — chỉ cập nhật
index + cảnh báo UI, và để user quyết định hành động đồng bộ (nếu có) một
cách tường minh (explicit opt-in), tương tự nguyên tắc "never silently
overwrite" đã áp dụng cho conflict ở R9.

## R16. Trạng thái mapping mở rộng

Bổ sung status cho `FolderMapping` (riêng với status của `Document`):

- `ACTIVE` — đang theo dõi bình thường.
- `DRIVE_DELETED` — folder Drive bị xoá, đang chờ user quyết định.
- `LOCAL_MISSING` — folder local không còn tồn tại (bị xoá/move ngoài ý
  muốn của app).
- `UNLINKED` — user chủ động xoá mapping nhưng giữ lại document con ở
  trạng thái không còn thuộc mapping nào.
