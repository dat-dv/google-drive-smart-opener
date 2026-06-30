# Tech Stack

- **Electron** — desktop shell (Main + Renderer process).
- **TypeScript** — toàn bộ codebase.
- **React** — UI layer trong Renderer process.
- **better-sqlite3** — database đồng bộ, nhanh, phù hợp Main process.
- **chokidar** — filesystem watcher cho Drive folder + local path.
- **Node.js** — runtime Main process.
- **electron-builder** — đóng gói & phân phối ứng dụng macOS (dmg/zip),
  code signing + notarization.

## Monorepo layout

```
google-drive-smart-opener/
├── docs/                  # Product spec — AI đọc trước khi code
├── apps/
│   ├── desktop/           # Electron + React app
│   └── website/           # (tương lai) landing page / docs site
├── packages/
│   ├── core/               # domain, usecases, services (framework-agnostic)
│   ├── database/           # SQLite repository implementation
│   ├── shared/              # types, utils dùng chung
│   └── ui/                  # shared React components
├── scripts/                 # build/dev scripts
├── .claude/                  # Claude Code config
├── .github/                  # CI workflows
├── CLAUDE.md
└── README.md
```
