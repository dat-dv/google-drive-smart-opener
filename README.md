# google-drive-smart-opener

Universal Document Manager cho macOS — bắt đầu với Google Drive làm
canonical storage. Xem chi tiết spec trong `docs/`.

## Bắt đầu

1. Đọc `docs/00-product.md` → `docs/05-roadmap.md` để hiểu toàn bộ bài
   toán.
2. Nếu dùng Claude Code: agent sẽ tự đọc `CLAUDE.md`.
3. Nếu dùng Codex CLI / Gemini CLI: agent đọc `AGENTS.md`.
4. Giao task theo từng module nhỏ, KHÔNG giao "build toàn bộ project"
   trong một lần. Ví dụ:

   ```
   Read docs/. Implement Database Layer only.
   ```

   ```
   Read docs/. Implement Electron bootstrap.
   ```

5. Sau mỗi module: review code, chạy test, rồi mới `git commit` và giao
   module tiếp theo.

## Cấu trúc

Xem `docs/tech-stack.md` mục "Monorepo layout".
