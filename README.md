# Google Drive Smart Opener

> 💡 Đây là dự án cá nhân được viết hoàn toàn bằng AI để tự động hóa công việc riêng của tác giả.

Ứng dụng macOS giúp tự động đẩy các file Office cục bộ (`.xlsx`, `.docx`, `.pptx`) vào Google Drive để mở trực tuyến trên trình duyệt (Google Sheets, Docs, Slides), giải quyết vấn đề thiếu ứng dụng đọc file Microsoft Office trên máy Mac.

---

## 🎯 Giải quyết vấn đề gì?

1. **Thiếu ứng dụng đọc file**: Các máy macOS thường không cài sẵn Microsoft Office (Excel, Word, PowerPoint).
2. **Cách giải quyết**:
   - Khi bạn mở một file Office cục bộ (local), ứng dụng sẽ tự động sao chép (import) file đó vào thư mục đồng bộ cục bộ của **Google Drive for Desktop**.
   - Sau khi Google Drive đồng bộ lên đám mây, ứng dụng sẽ đọc Google Drive Item ID (từ macOS Extended Attributes `xattr`) và **mở trực tiếp tệp tin đó trực tuyến trên trình duyệt** bằng Google Sheets/Docs.
3. **Tránh trùng lặp (No Duplicate)**: Sử dụng cơ chế lưu trữ (SQLite cache) để so khớp mã băm (MD5 hash) và đường dẫn gốc. Nhờ đó, nếu bạn mở lại file cũ, ứng dụng sẽ mở thẳng liên kết cũ thay vì tạo thêm bản sao mới.

_Lưu ý: Ứng dụng yêu cầu phần mềm **Google Drive for Desktop** đang hoạt động để thực hiện đồng bộ._

---

## ✨ Tính năng chính

- 📁 **Cây thư mục liên kết**: Quản lý danh sách các tệp tin cục bộ đã được ánh xạ lên Drive.
- ⚡ **Mở nhanh thư mục (Dual Reveal)**: Cho phép mở nhanh thư mục chứa tệp tin gốc trên máy Mac hoặc thư mục đồng bộ Google Drive.
- ⚠️ **Xử lý xung đột**: Phát hiện và cho phép chọn phiên bản ghi đè nếu cả local và Drive mirror đều bị sửa đổi độc lập.

---

## 🚀 Khởi chạy nhanh

```bash
# 1. Cài đặt dependencies
npm install

# 2. Chạy ứng dụng ở chế độ phát triển
npm run dev

# 3. Đóng gói ứng dụng cho macOS
npm run build:mac
```
