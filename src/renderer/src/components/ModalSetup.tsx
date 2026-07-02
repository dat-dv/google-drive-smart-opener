import React, { useState, useEffect } from 'react'

export interface ModalSetupProps {
  isOpen: boolean
  driveRootInfo: {
    path: string
    isConfigured: boolean
  } | null
  onSave: (path: string) => Promise<boolean>
  onCancel: () => void
}

export function ModalSetup({
  isOpen,
  driveRootInfo,
  onSave,
  onCancel
}: ModalSetupProps): React.JSX.Element | null {
  if (!isOpen) return null

  const [setupPathInput, setSetupPathInput] = useState(driveRootInfo?.path || '')

  useEffect(() => {
    if (driveRootInfo?.path) {
      setSetupPathInput(driveRootInfo.path)
    }
  }, [driveRootInfo])

  const handleBrowseSetupPath = async (): Promise<void> => {
    try {
      const selected = await window.electron.ipcRenderer.invoke('dialog:select-folder')
      if (selected) {
        setSetupPathInput(selected)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleSaveSetupPath = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!setupPathInput.trim()) return

    const success = await onSave(setupPathInput)
    if (success) {
      // Completed saving path
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in duration-200">
        <div className="p-6 pb-4 border-b border-white/5 bg-gradient-to-br from-indigo-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/15 rounded-xl border border-indigo-500/30 text-indigo-400">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Setup Google Drive Directory
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Connect the Smart Opener to your local Google Drive folder.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveSetupPath} className="p-6 flex flex-col gap-5">
          <div className="text-xs text-slate-400 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
            <p className="mb-2 font-semibold text-slate-300">Why is this needed?</p>
            Google Drive for Desktop syncs your cloud files locally. To read the file metadata (Item
            IDs) and map folders, the app needs to know your local Google Drive root folder path.
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Local Google Drive Root Folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="E.g., /Users/username/Library/CloudStorage/GoogleDrive-email"
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 bg-slate-950/40 text-slate-200 placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-indigo-500/50 transition-all"
                value={setupPathInput}
                onChange={(e): void => setSetupPathInput(e.target.value)}
              />
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 transition-all flex items-center gap-1.5 shrink-0"
                onClick={handleBrowseSetupPath}
              >
                Browse...
              </button>
            </div>
            {driveRootInfo && !driveRootInfo.isConfigured && (
              <span className="text-[10px] text-amber-400/90 font-medium">
                ⚠️ Auto-detected path shown above. Please verify or change if needed.
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 mt-2">
            {driveRootInfo?.isConfigured && (
              <button
                type="button"
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-slate-300 transition-all"
                onClick={onCancel}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!setupPathInput.trim()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:from-indigo-500/50 disabled:to-indigo-600/50 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/35 hover:-translate-y-0.5 disabled:pointer-events-none active:translate-y-0 transition-all duration-200"
            >
              Save and Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
