# Sơ Đồ Cây Luồng Hoạt Động (Operational Flow Tree)

Tài liệu này thể hiện toàn bộ nhánh rẽ quyết định của hệ thống dưới dạng sơ đồ cây phân cấp khi nhận sự kiện mở một tệp tin.

```
[Mở File Cục Bộ (Open File Request)]
└── Phân tích đường dẫn tuyệt đối (Resolve Absolute Path)
    └── Kiểm tra Cơ sở dữ liệu SQLite (Query SQLite Document Index)
        │
        ├── 1. DATABASE HIT (Tìm thấy bản ghi liên kết đã tồn tại)
        │   ├── Tính mã băm MD5 của File Local & File Drive tương ứng
        │   └── Phân loại trạng thái (DocumentStateClassifier.classify)
        │       │
        │       ├── [Case 1] DRIVE_DELETED (File trên Drive đã bị xóa)
        │       │   └── Kích hoạt: DriveDeletedStrategy
        │       │       └── Hành vi: Đổi trạng thái -> 'DRIVE_DELETED', thông báo lỗi.
        │       │
        │       ├── [Case 2] CONFLICT_BOTH_CHANGED (Cả hai bên đều sửa đổi khác nhau)
        │       │   └── Kích hoạt: ConflictStrategy
        │       │       └── Hành vi: Hiển thị giao diện giải quyết xung đột (6 Lựa chọn)
        │       │           ├── KEEP_DRIVE ───────────► Ghi đè Drive đè lên Local, cập nhật DB, mở Drive
        │       │           ├── KEEP_LOCAL ───────────► Ghi đè Local lên Drive, cập nhật DB, mở Drive
        │       │           ├── KEEP_BOTH_RENAME_LOCAL ► Đổi tên Local, import bản Local mới lên Drive, mở bản mới
        │       │           ├── KEEP_BOTH_RENAME_DRIVE ► Đổi tên Drive cũ, copy Local vào đường dẫn cũ, link & mở
        │       │           ├── OPEN_DRIVE_ANYWAY ────► Không đồng bộ, mở trực tiếp bản Drive
        │       │           └── OPEN_LOCAL_ANYWAY ────► Không đồng bộ, mở trực tiếp bản Local
        │       │
        │       ├── [Case 3] LOCAL_CHANGED_DRIVE_OLD (Chỉ Local thay đổi nội dung)
        │       │   └── Kích hoạt: LocalChangedStrategy
        │       │       └── Hành vi: Tự động copy Local -> Drive, cập nhật hash trong DB, mở Drive
        │       │
        │       ├── [Case 4] DRIVE_CHANGED_LOCAL_OLD (Chỉ Drive thay đổi nội dung)
        │       │   └── Kích hoạt: DriveChangedStrategy
        │       │       └── Hành vi: Tự động copy Drive -> Local, cập nhật hash trong DB, mở Drive
        │       │
        │       └── [Case 5] LOCAL_AND_DRIVE_IS_SAME (Nội dung hai bên khớp hoàn toàn)
        │           └── Hành vi: Cập nhật lastOpened trong DB, mở trực tiếp bản Drive
        │
        └── 2. DATABASE MISS (Chưa từng liên kết file này trước đây)
            │
            ├── [Nhánh Ngoại tuyến] Máy đang mất kết nối mạng (Offline)
            │   └── Hành vi:
            │       ├── Tạo document tạm thời ('UNLINKED', gắn cờ offlinePending)
            │       ├── Mở file Local bằng ứng dụng mặc định cục bộ
            │       └── Tạo tác vụ ngoại tuyến (OfflineTask: 'IMPORT_FILE') để đồng bộ sau khi có mạng
            │
            └── [Nhánh Trực tuyến] Máy có kết nối mạng bình thường (Online)
                └── Quét tìm kiếm ứng viên trên Google Drive theo tên file (Search Candidates by Name)
                    │
                    ├── [Case A] Tìm thấy 0 ứng viên (Không trùng tên trên Drive)
                    │   └── Hành vi: Tự động Import (Copy Local lên Drive folder 'My Drive/Other', tạo DB record 'LINKED', mở Drive)
                    │
                    ├── [Case B] Tìm thấy 1 ứng viên duy nhất OR Trùng cả Size + MD5 Hash
                    │   └── Hành vi: Hiển thị hộp thoại chọn ứng viên đơn lẻ (Single Candidate Modal)
                    │       ├── LINK_EXISTING ────────► Gắn kết file Local vào ứng viên Drive có sẵn, mở Drive
                    │       ├── IMPORT_AS_NEW ────────► Copy Local lên Drive như file mới hoàn toàn, mở Drive
                    │       └── CANCEL ───────────────► Hủy bỏ hành động
                    │
                    └── [Case C] Tìm thấy nhiều file trùng tên trên Drive
                        └── Hành vi: Hiển thị bảng chọn nhiều ứng viên (Multiple Candidates Modal)
                            ├── CHOOSE_EXISTING ──────► Gắn kết Local vào ứng viên được chọn, mở Drive
                            ├── IMPORT_AS_NEW ────────► Copy Local lên Drive dưới dạng file mới, mở Drive
                            └── CANCEL ───────────────► Hủy bỏ hành động
```
