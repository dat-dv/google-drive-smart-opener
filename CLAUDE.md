# CLAUDE.md — Quy ước làm việc cho Claude Code

## Bắt buộc trước khi code

1. Luôn đọc toàn bộ thư mục `docs/` trước khi viết bất kỳ dòng code nào.
2. Không bao giờ generate code mà chưa đọc `docs/01-requirements.md` và
   `docs/02-architecture.md` liên quan đến phần đang làm.
3. Luôn tuân theo Clean Architecture đã mô tả trong
   `docs/02-architecture.md`. Domain layer không phụ thuộc Electron/Node
   trực tiếp.

## Quy tắc code

- Dùng TypeScript strict, không dùng `any`.
- Ưu tiên composition hơn inheritance.
- Viết test cho mọi use case/service mới.
- Tuân thủ `docs/coding-style.md`.
- Mọi tích hợp cloud phải đi qua interface `CloudProvider`
  (`packages/core/domain`), không import thẳng `GoogleDriveProvider` ở
  layer ngoài use case.

## Cách nhận task

- Mỗi lần chỉ nhận và hoàn thành **một module hoặc một use case** (ví dụ:
  Database layer, Watcher, Import Service...).
- Sau khi hoàn thành một module: dừng lại, để người dùng review và commit
  trước khi sang module tiếp theo. Không tự ý làm tiếp module khác.
- Nếu yêu cầu không rõ phạm vi (ví dụ "build my project"), hỏi lại để xác
  định đúng module/use case cần làm trong lượt này.

## Thứ tự triển khai chuẩn (tham khảo docs/05-roadmap.md)

1. Đọc docs
2. Review requirement
3. Thiết kế Architecture (nếu chưa có)
4. ERD
5. Folder structure
6. TypeScript interfaces
7. Domain model
8. Database layer
9. IPC
10. Electron bootstrap
11. Watcher
12. Repository
13. Import Service
14. Conflict Resolver
15. Mapping Service + Mapping Tree UI
16. Settings/Search UI
17. Testing
18. Packaging
