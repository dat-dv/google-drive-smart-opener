import React from 'react'
import type { Document } from '@shared/types'

interface Props {
  /** Called when the user confirms a folder-reveal IPC call. */
  filePath: string | null
  title?: string
}

/**
 * Reusable inline button that opens the OS file manager at the given path.
 * Renders nothing if filePath is null/empty.
 */
export function ShowInFolderButton({ filePath, title = 'Open containing folder' }: Props): React.JSX.Element | null {
  if (!filePath) return null
  return (
    <button
      onClick={(e): void => {
        e.stopPropagation()
        window.electron.ipcRenderer.invoke('dialog:show-in-folder', filePath)
      }}
      className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 transition-all duration-150 shrink-0"
      title={title}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    </button>
  )
}

/** Props for the Single Candidate modal. */
export interface ModalSingleProps {
  prompt: { id: string; localPath: string; candidate: Document }
  onRespond: (action: 'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL') => void
}

/** Shown when exactly one Drive candidate matches the local file. */
export function ModalSingle({ prompt, onRespond }: ModalSingleProps): React.JSX.Element {
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
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <strong className="text-slate-500">Local:</strong> {prompt.localPath}
              </div>
              <ShowInFolderButton filePath={prompt.localPath} />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <strong className="text-slate-500">Drive:</strong> {prompt.candidate.drivePath}
              </div>
              <ShowInFolderButton filePath={prompt.candidate.localOriginalPath} />
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
            Link &amp; Open Drive
          </button>
        </div>
      </div>
    </div>
  )
}

/** Props for the Multiple Candidates picker modal. */
export interface ModalMultipleProps {
  prompt: { id: string; localPath: string; candidates: Document[] }
  selectedCandidateId: string | null
  onSelectCandidate: (id: string) => void
  onRespond: (action: 'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL') => void
}

/** Shown when multiple Drive files match the local file name. */
export function ModalMultiple({
  prompt,
  selectedCandidateId,
  onSelectCandidate,
  onRespond
}: ModalMultipleProps): React.JSX.Element {
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Select Drive Document</h2>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-white/5 bg-slate-950/30 text-xs font-mono break-all text-slate-300">
            <div className="min-w-0 flex-1">
              <strong className="text-slate-500">Local:</strong> {prompt.localPath}
            </div>
            <ShowInFolderButton filePath={prompt.localPath} />
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Multiple matches found in Google Drive. Select which document to link:
          </p>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
            {prompt.candidates.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selectedCandidateId === c.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                    : 'border-white/5 bg-white/2 hover:bg-white/5 text-slate-300'
                }`}
                onClick={(): void => onSelectCandidate(c.id)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ShowInFolderButton filePath={c.localOriginalPath} />
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
            onClick={(): void => onRespond('OPEN_DRIVE')}
            disabled={!selectedCandidateId}
          >
            Link &amp; Open
          </button>
        </div>
      </div>
    </div>
  )
}

type ConflictChoice =
  | 'KEEP_DRIVE'
  | 'KEEP_LOCAL'
  | 'KEEP_BOTH_RENAME_LOCAL'
  | 'KEEP_BOTH_RENAME_DRIVE'
  | 'OPEN_DRIVE_ANYWAY'
  | 'OPEN_LOCAL_ANYWAY'
  | 'CANCEL'

/** Props for the Conflict Resolution modal. */
export interface ModalConflictProps {
  prompt: { id: string; localPath: string; document: Document }
  onRespond: (choice: ConflictChoice) => void
}

/** Shown when both local and Drive copies have diverged. */
export function ModalConflict({ prompt, onRespond }: ModalConflictProps): React.JSX.Element {
  const options: { choice: ConflictChoice; label: string; desc: string; badge: string; color: string }[] = [
    { choice: 'KEEP_DRIVE', label: 'Keep Drive Copy', desc: 'Overwrite your local file with the Google Drive version.', badge: '➔ Local', color: 'hover:bg-emerald-500/10 hover:border-emerald-500/30' },
    { choice: 'KEEP_LOCAL', label: 'Keep Local Copy', desc: 'Push your local changes to replace the Drive version.', badge: '➔ Drive', color: 'hover:bg-indigo-500/10 hover:border-indigo-500/30' },
    { choice: 'KEEP_BOTH_RENAME_LOCAL', label: 'Keep Both (Rename Local)', desc: 'Rename local to "file (Local Conflict)" and upload as new.', badge: '📁', color: 'hover:bg-indigo-500/5 hover:border-indigo-500/20' },
    { choice: 'KEEP_BOTH_RENAME_DRIVE', label: 'Keep Both (Rename Drive Copy)', desc: 'Rename the old Drive copy and upload your local copy to the original path.', badge: '☁️', color: 'hover:bg-indigo-500/5 hover:border-indigo-500/20' },
    { choice: 'OPEN_DRIVE_ANYWAY', label: 'Open Drive Version Anyway', desc: 'Open the Drive mirror file as-is without resolving the conflict status.', badge: '➔ View', color: 'hover:bg-white/5' },
    { choice: 'OPEN_LOCAL_ANYWAY', label: 'Open Local Version Anyway', desc: 'Open your local original file directly without synchronization changes.', badge: '➔ Local View', color: 'hover:bg-white/5' },
  ]

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-xl bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Synchronization Conflict Detected</h2>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2.5 p-4 rounded-xl border border-white/5 bg-slate-950/30 text-xs font-mono break-all text-slate-300">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <strong className="text-slate-500">Local:</strong> {prompt.localPath}
              </div>
              <ShowInFolderButton filePath={prompt.localPath} />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <strong className="text-slate-500">Drive:</strong> {prompt.document.drivePath}
              </div>
              <ShowInFolderButton filePath={prompt.document.localOriginalPath} />
            </div>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Both local and Drive copies have been modified independently. Select a resolution strategy:
          </p>
          <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
            {options.map(({ choice, label, desc, badge, color }) => (
              <div
                key={choice}
                className={`flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 cursor-pointer transition-all duration-200 ${color}`}
                onClick={(): void => onRespond(choice)}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-slate-200">{label}</span>
                  <span className="text-xs text-slate-500">{desc}</span>
                </div>
                <span className="text-xs text-slate-400 shrink-0 ml-4">{badge}</span>
              </div>
            ))}
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
