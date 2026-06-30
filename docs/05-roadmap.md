# Roadmap

## MVP Milestones

1. **M0 — Bootstrap**: Electron + TypeScript + React scaffold chạy được,
   cửa sổ chính trống.
2. **M1 — Database layer**: schema, migration, Repository cho Document.
3. **M2 — GoogleDriveProvider (read-only)**: search + scan folder Drive.
4. **M3 — Open workflow**: lookup DB → mở Drive version (chưa có
   intercept OS thật, test qua CLI/manual trigger trước).
5. **M4 — Import Service**: case 1/2/3 (similar found / multiple / not
   found), dialog tương ứng.
6. **M5 — Watcher**: chokidar trên Drive folder + local path, cập nhật
   index tự động.
7. **M6 — Conflict Resolver**: detect + dialog 6 lựa chọn.
8. **M7 — OS-level file interception thật** (Launch Services / default
   app registration trên macOS).
9. **M8 — Mapping Service + Mapping Tree UI**: CRUD `FolderMapping`, áp
   dụng chính sách đồng bộ cấu trúc thư mục (R15), banner cảnh báo trên
   UI khi Drive folder rename/move/delete.
10. **M9 — Settings UI + Search Engine UI**.
11. **M10 — Packaging**: electron-builder, code signing, notarization.

## Future Roadmap

- DropboxProvider, OneDriveProvider, iCloudProvider.
- Semantic search (embeddings) trong Search Engine.
- Multi-device sync trạng thái "last opened".
- Team/shared drive support.
- Windows port (đổi phần OS-level interception).

## Risks

- macOS không cho phép "intercept mọi loại file mở" một cách tổng quát;
  cần research kỹ Launch Services / UTType / default app registration,
  có thể giới hạn theo nhóm file type đăng ký được.
- Google Drive Desktop thay đổi cấu trúc thư mục local giữa các phiên bản
  → cần fallback config đường dẫn trong Settings.
- Conflict resolution sai có thể làm mất dữ liệu người dùng → ưu tiên
  tuyệt đối nguyên tắc "never silently overwrite".
- Hiệu năng khi Drive có 100k+ file → bắt buộc index-first, tránh scan
  trực tiếp filesystem trong main thread (dùng worker thread nếu cần).

## Testing Strategy

- Unit test cho domain/usecases (Vitest/Jest), không phụ thuộc Electron.
- Integration test cho Repository + SQLite (in-memory DB).
- Mock CloudProvider để test Document Service không cần Google Drive thật.
- E2E test cơ bản cho Electron (Playwright/Spectron-equivalent) cho luồng
  mở file → dialog → kết quả.

## Production Deployment

- electron-builder build cho macOS (dmg + zip), code signing bằng
  Developer ID, notarization qua `xcrun notarytool`.
- Auto-update qua `electron-updater` (giai đoạn sau MVP).
- CI: GitHub Actions build + test trên macOS runner.
