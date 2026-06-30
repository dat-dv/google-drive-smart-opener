# Coding Style

- TypeScript strict mode bật toàn bộ. Không dùng `any`.
- Ưu tiên composition hơn inheritance.
- Domain layer (`packages/core/domain`) không import Electron, Node `fs`,
  hay bất kỳ thư viện infra nào trực tiếp — chỉ làm việc qua interface.
- Mỗi use case là 1 class/function thuần, dễ test, không side-effect ẩn.
- Đặt tên file theo kebab-case, tên class/interface theo PascalCase.
- Mọi function public phải có JSDoc ngắn gọn nếu logic không hiển nhiên.
- Viết test cho mọi use case mới trước khi coi là "done".
- Không commit code chưa build/test pass.
