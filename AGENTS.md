# AGENTS.md

Tài liệu này dành cho các AI coding agent khác Claude Code (Codex CLI,
Gemini CLI...). Quy tắc giống hệt `CLAUDE.md`:

1. Đọc `docs/` trước khi code.
2. Tuân thủ Clean Architecture trong `docs/02-architecture.md`.
3. Mỗi lượt chỉ làm một module/use case, dừng lại để review trước khi
   tiếp tục.
4. Không dùng `any` trong TypeScript.
5. Mọi tích hợp cloud đi qua interface `CloudProvider`.

Xem chi tiết quy ước đầy đủ trong `CLAUDE.md`.
