# Product Specification — Universal Document Manager
(codename: Google Drive Smart Opener)

## Mục tiêu

Ứng dụng macOS đóng vai trò là default file opener của hệ thống. Khi người
dùng mở bất kỳ file nào (double click, Finder, Spotlight...), thay vì mở
trực tiếp bản local, ứng dụng can thiệp (intercept) và đảm bảo người dùng
luôn làm việc trên **một phiên bản canonical duy nhất** được lưu trong
Google Drive.

## Định nghĩa sản phẩm

- KHÔNG phải phần mềm đồng bộ kiểu Dropbox.
- KHÔNG phải Google Drive client.
- LÀ một **Document Manager**: lớp trung gian quản lý "tài liệu nào tương
  ứng với bản nào trên cloud".
- Google Drive là **source of truth**.

## Tầm nhìn mở rộng

Giai đoạn đầu chỉ hỗ trợ Google Drive, nhưng kiến trúc được thiết kế theo
interface `CloudProvider` để sau này có thể thêm Dropbox, OneDrive, iCloud,
Nextcloud mà không phải sửa phần còn lại của ứng dụng.

## Giá trị mang lại

- Không còn tình trạng nhiều bản sao của cùng một tài liệu nằm rải rác.
- Không còn nhầm lẫn "bản nào là bản mới nhất".
- Tự động phát hiện và xử lý xung đột (conflict) giữa bản local và bản
  trên Drive.
