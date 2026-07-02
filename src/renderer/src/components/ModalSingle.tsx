import React from 'react'
import type { Document } from '@shared/types'

export interface ModalSingleProps {
  isOpen: boolean
  localPath: string
  candidate: Document
  onRespond: (action: 'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL') => void
}

export function ModalSingle({
  isOpen,
  localPath,
  candidate,
  onRespond
}: ModalSingleProps): React.JSX.Element | null {
  if (!isOpen) return null

  const handleShowInFolder = (path: string): void => {
    window.electron.ipcRenderer.invoke('dialog:show-in-folder', path)
  }

  const handlePreviewOnline = async (drivePath: string): Promise<void> => {
    const result = await window.electron.ipcRenderer.invoke('drive:preview-online', drivePath)
    if (result && !result.success) {
      alert(`Cannot preview online: ${result.error}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Link to existing Drive file?</h2>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            A matching Google Drive document was found for your local file:
          </p>
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
                <strong className="text-slate-500">Drive:</strong> {candidate.drivePath}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(): Promise<void> => handlePreviewOnline(candidate.drivePath)}
                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-indigo-400 transition-all duration-150"
                  title="Preview Online (Open in Browser)"
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </button>
                {candidate.localOriginalPath && (
                  <button
                    onClick={(): void => handleShowInFolder(candidate.localOriginalPath!)}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 transition-all duration-150"
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
          </div>
        </div>
        <div className="p-5 bg-slate-950/20 border-t border-white/5 flex items-center justify-end gap-3">
          <button
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-slate-300 transition-all"
            onClick={(): void => onRespond('CANCEL')}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-sm font-semibold text-slate-300 transition-all"
            onClick={(): void => onRespond('IMPORT_NEW')}
          >
            Import as New Copy
          </button>
          <button
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all"
            onClick={(): void => onRespond('OPEN_DRIVE')}
          >
            Link & Open Drive
          </button>
        </div>
      </div>
    </div>
  )
}
