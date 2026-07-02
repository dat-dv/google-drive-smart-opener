import React from 'react'
import type { Document } from '@shared/types'

export interface ModalConflictProps {
  isOpen: boolean
  localPath: string
  document: Document
  onRespond: (
    choice:
      | 'KEEP_DRIVE'
      | 'KEEP_LOCAL'
      | 'KEEP_BOTH_RENAME_LOCAL'
      | 'KEEP_BOTH_RENAME_DRIVE'
      | 'OPEN_DRIVE_ANYWAY'
      | 'OPEN_LOCAL_ANYWAY'
      | 'CANCEL'
  ) => void
}

export function ModalConflict({
  isOpen,
  localPath,
  document,
  onRespond
}: ModalConflictProps): React.JSX.Element | null {
  if (!isOpen) return null

  const handleShowInFolder = (path: string): void => {
    window.electron.ipcRenderer.invoke('dialog:show-in-folder', path)
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-xl bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Synchronization Conflict Detected</h2>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2.5 p-4 rounded-xl border border-white/5 bg-slate-950/30 text-xs font-mono break-all text-slate-300">
            <div className="flex items-start justify-between gap-3 group">
              <div className="min-w-0 flex-1">
                <strong className="text-slate-500">Local:</strong> {localPath}
              </div>
              <button
                onClick={(): void => handleShowInFolder(localPath)}
                className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 transition-all duration-150 shrink-0"
                title="Open containing folder"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              </button>
            </div>
            <div className="flex items-start justify-between gap-3 group">
              <div className="min-w-0 flex-1">
                <strong className="text-slate-500">Drive:</strong> {document.drivePath}
              </div>
              {document.localOriginalPath && (
                <button
                  onClick={(): void => handleShowInFolder(document.localOriginalPath!)}
                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 transition-all duration-150 shrink-0"
                  title="Open containing folder"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Both local and Drive copies have been modified independently. Select a resolution
            strategy:
          </p>
          <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
            {/* 1. KEEP_DRIVE */}
            <div
              className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-emerald-500/10 hover:border-emerald-500/30 cursor-pointer transition-all duration-200"
              onClick={(): void => onRespond('KEEP_DRIVE')}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-slate-200">Keep Drive Copy</span>
                <span className="text-xs text-slate-500">
                  Overwrite your local file with the Google Drive version.
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-400">➔ Local</span>
            </div>

            {/* 2. KEEP_LOCAL */}
            <div
              className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-indigo-500/10 hover:border-indigo-500/30 cursor-pointer transition-all duration-200"
              onClick={(): void => onRespond('KEEP_LOCAL')}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-slate-200">Keep Local Copy</span>
                <span className="text-xs text-slate-500">
                  Push your local changes to replace the Drive version.
                </span>
              </div>
              <span className="text-xs font-bold text-indigo-400">➔ Drive</span>
            </div>

            {/* 3. KEEP_BOTH_RENAME_LOCAL */}
            <div
              className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-indigo-500/5 hover:border-indigo-500/20 cursor-pointer transition-all duration-200"
              onClick={(): void => onRespond('KEEP_BOTH_RENAME_LOCAL')}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-slate-200">Keep Both (Rename Local)</span>
                <span className="text-xs text-slate-500">
                  Rename local to &quot;file (Local Conflict)&quot; and upload as new.
                </span>
              </div>
              <span className="text-lg">📁</span>
            </div>

            {/* 4. KEEP_BOTH_RENAME_DRIVE */}
            <div
              className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-indigo-500/5 hover:border-indigo-500/20 cursor-pointer transition-all duration-200"
              onClick={(): void => onRespond('KEEP_BOTH_RENAME_DRIVE')}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-slate-200">
                  Keep Both (Rename Drive Copy)
                </span>
                <span className="text-xs text-slate-500">
                  Rename the old Drive copy and upload your local copy to the original path.
                </span>
              </div>
              <span className="text-lg">☁️</span>
            </div>

            {/* 5. OPEN_DRIVE_ANYWAY */}
            <div
              className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 cursor-pointer transition-all duration-200"
              onClick={(): void => onRespond('OPEN_DRIVE_ANYWAY')}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-slate-200">Open Drive Version Anyway</span>
                <span className="text-xs text-slate-500">
                  Open the Drive mirror file as-is without resolving the conflict status.
                </span>
              </div>
              <span className="text-xs text-slate-400">➔ View</span>
            </div>

            {/* 6. OPEN_LOCAL_ANYWAY */}
            <div
              className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 cursor-pointer transition-all duration-200"
              onClick={(): void => onRespond('OPEN_LOCAL_ANYWAY')}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-slate-200">Open Local Version Anyway</span>
                <span className="text-xs text-slate-500">
                  Open your local original file directly without synchronization changes.
                </span>
              </div>
              <span className="text-xs text-slate-400">➔ Local View</span>
            </div>
          </div>
        </div>
        <div className="p-5 bg-slate-950/20 border-t border-white/5 flex items-center justify-end">
          <button
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-slate-300 transition-all"
            onClick={(): void => onRespond('CANCEL')}
          >
            Cancel Opening
          </button>
        </div>
      </div>
    </div>
  )
}
