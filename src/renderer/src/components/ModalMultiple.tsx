import React, { useState } from 'react'
import type { Document } from '@shared/types'

export interface ModalMultipleProps {
  isOpen: boolean
  localPath: string
  candidates: Document[]
  onRespond: (action: 'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL', selectedCandidateId?: string) => void
}

export function ModalMultiple({
  isOpen,
  localPath,
  candidates,
  onRespond
}: ModalMultipleProps): React.JSX.Element | null {
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
          <h2 className="text-lg font-bold text-white">Select Drive Document</h2>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-white/5 bg-slate-950/30 text-xs font-mono break-all text-slate-300">
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
          <p className="text-sm text-slate-400 leading-relaxed">
            Multiple matches found in Google Drive. Select which document to link:
          </p>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
            {candidates.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selectedId === c.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                    : 'border-white/5 bg-white/2 hover:bg-white/5 text-slate-300'
                }`}
                onClick={(): void => setSelectedId(c.id)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    onClick={(e): void => {
                      e.stopPropagation()
                      handlePreviewOnline(c.drivePath)
                    }}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-indigo-400 transition-all duration-150 shrink-0"
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
                  {c.localOriginalPath && (
                    <button
                      onClick={(e): void => {
                        e.stopPropagation()
                        handleShowInFolder(c.localOriginalPath!)
                      }}
                      className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-amber-400 transition-all duration-150 shrink-0"
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
                  <span className="text-xs font-medium font-mono truncate">{c.drivePath}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950/40 text-slate-500 uppercase tracking-wider font-semibold shrink-0 ml-2">
                  {c.status}
                </span>
              </div>
            ))}
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
            Import as New
          </button>
          <button
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
            onClick={(): void => {
              if (selectedId) {
                onRespond('OPEN_DRIVE', selectedId)
              }
            }}
            disabled={!selectedId}
          >
            Link & Open
          </button>
        </div>
      </div>
    </div>
  )
}
