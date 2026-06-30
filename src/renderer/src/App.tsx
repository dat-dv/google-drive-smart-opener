import React, { useState, useEffect } from 'react'
import type { Document } from '@shared/types'
import { DocumentTree } from './components/DocumentTree'
import { ModalSingle } from './components/ModalSingle'
import { ModalMultiple } from './components/ModalMultiple'
import { ModalConflict } from './components/ModalConflict'
import { ModalSetup } from './components/ModalSetup'

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'documents' | 'conflicts'>('documents')
  const [conflicts, setConflicts] = useState<Document[]>([])
  const [allDocs, setAllDocs] = useState<Document[]>([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({ 'My Drive': true })
  const handleTogglePath = (path: string): void => {
    setExpandedPaths((prev) => ({
      ...prev,
      [path]: !prev[path]
    }))
  }

  // P1.3: Loading state while main process is handling a file open
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingFile, setProcessingFile] = useState<string | null>(null)

  // Google Drive Root Configuration settings states
  const [driveRootInfo, setDriveRootInfo] = useState<{
    path: string
    isConfigured: boolean
  } | null>(null)
  const [showSetupModal, setShowSetupModal] = useState(false)

  // Modal Prompts from Main Process
  const [singlePrompt, setSinglePrompt] = useState<{
    id: string
    localPath: string
    candidate: Document
  } | null>(null)

  const [multiplePrompt, setMultiplePrompt] = useState<{
    id: string
    localPath: string
    candidates: Document[]
  } | null>(null)

  const [conflictPrompt, setConflictPrompt] = useState<{
    id: string
    localPath: string
    document: Document
  } | null>(null)

  // Load Google Drive root path info
  const loadDriveRootInfo = async (): Promise<void> => {
    try {
      const info = await window.electron.ipcRenderer.invoke('settings:get-drive-root')
      setDriveRootInfo(info)
      if (info && !info.isConfigured) {
        setShowSetupModal(true)
      }
    } catch (err) {
      console.error('Failed to load drive root info:', err)
    }
  }

  // Load Conflicting Documents
  const loadConflicts = async (): Promise<void> => {
    try {
      const list = await window.electron.ipcRenderer.invoke('documents:list-conflicts')
      setConflicts(list || [])
    } catch (err) {
      console.error('Failed to load conflicts:', err)
    }
  }

  // Load All Document Connections
  const loadAllDocs = async (): Promise<void> => {
    try {
      const list = await window.electron.ipcRenderer.invoke('documents:list-all')
      setAllDocs(list || [])
    } catch (err) {
      console.error('Failed to load all docs:', err)
    }
  }

  const reloadAllData = (): void => {
    loadConflicts()
    loadAllDocs()
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDriveRootInfo()
    reloadAllData()

    // Notify main process about initial network status
    window.electron.ipcRenderer.send('network-status:changed', navigator.onLine)

    const handleOnline = (): void => {
      setIsOnline(true)
      window.electron.ipcRenderer.send('network-status:changed', true)
      setTimeout(reloadAllData, 1000)
    }

    const handleOffline = (): void => {
      setIsOnline(false)
      window.electron.ipcRenderer.send('network-status:changed', false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Listeners for Interactive Interactor flows
    const unsubSingle = window.electron.ipcRenderer.on(
      'prompt-single-candidate',
      (_, data: { id: string; localPath: string; candidate: Document }) => {
        setSinglePrompt(data)
      }
    )

    const unsubMultiple = window.electron.ipcRenderer.on(
      'prompt-multiple-candidates',
      (_, data: { id: string; localPath: string; candidates: Document[] }) => {
        setMultiplePrompt(data)
      }
    )

    const unsubConflict = window.electron.ipcRenderer.on(
      'prompt-conflict',
      (_, data: { id: string; localPath: string; document: Document }) => {
        setConflictPrompt(data)
      }
    )

    const unsubShowSetup = window.electron.ipcRenderer.on('show-setup-modal', () => {
      setShowSetupModal(true)
    })

    // P1.3: Loading overlay — listen for file processing lifecycle events
    const unsubProcessingStart = window.electron.ipcRenderer.on(
      'file-processing-start',
      (_, filename: string) => {
        setIsProcessing(true)
        setProcessingFile(filename)
      }
    )

    const unsubProcessingDone = window.electron.ipcRenderer.on('file-processing-done', () => {
      setIsProcessing(false)
      setProcessingFile(null)
    })

    // Signal to main process that React has fully mounted and all IPC listeners are active.
    // Main process waits for this before flushing the startup file queue.
    window.electron.ipcRenderer.send('renderer-ready')

    return (): void => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (typeof unsubSingle === 'function') unsubSingle()
      if (typeof unsubMultiple === 'function') unsubMultiple()
      if (typeof unsubConflict === 'function') unsubConflict()
      if (typeof unsubShowSetup === 'function') unsubShowSetup()
      if (typeof unsubProcessingStart === 'function') unsubProcessingStart()
      if (typeof unsubProcessingDone === 'function') unsubProcessingDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClearCache = async (): Promise<void> => {
    const confirmClear = confirm(
      'Are you sure you want to clear all cache and reset settings? This will restart configuration from scratch.'
    )
    if (!confirmClear) return
    try {
      await window.electron.ipcRenderer.invoke('settings:clear-cache')
      alert('Cache cleared successfully!')
      loadDriveRootInfo()
      reloadAllData()
    } catch (err) {
      alert(`Error clearing cache: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleSaveSetupPath = async (path: string): Promise<boolean> => {
    try {
      const validation = await window.electron.ipcRenderer.invoke(
        'settings:validate-drive-root',
        path
      )
      if (!validation.valid) {
        alert(`Error: ${validation.warning}`)
        return false
      }

      if (validation.warning) {
        const confirmSave = confirm(`${validation.warning}\n\nDo you want to use this path anyway?`)
        if (!confirmSave) return false
      }

      await window.electron.ipcRenderer.invoke('settings:set-drive-root', path)
      setShowSetupModal(false)
      loadDriveRootInfo()
      reloadAllData()
      return true
    } catch (err) {
      alert(
        `Error setting Google Drive root path: ${err instanceof Error ? err.message : String(err)}`
      )
      return false
    }
  }

  // Resolve Single Candidate Prompt
  const respondSingle = (action: 'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL'): void => {
    if (!singlePrompt) return
    window.electron.ipcRenderer.send(`prompt-single-candidate-response-${singlePrompt.id}`, action)
    setSinglePrompt(null)
    setTimeout(reloadAllData, 500)
  }

  // Resolve Multiple Candidates Prompt
  const respondMultiple = (action: 'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL', selectedId?: string): void => {
    if (!multiplePrompt) return
    if (action === 'OPEN_DRIVE') {
      const selected = multiplePrompt.candidates.find((c) => c.id === selectedId)
      if (!selected) return
      window.electron.ipcRenderer.send(`prompt-multiple-candidates-response-${multiplePrompt.id}`, {
        action,
        selected
      })
    } else {
      window.electron.ipcRenderer.send(`prompt-multiple-candidates-response-${multiplePrompt.id}`, {
        action
      })
    }
    setMultiplePrompt(null)
    setTimeout(reloadAllData, 500)
  }

  // Resolve Conflict Prompt
  const respondConflict = (
    choice:
      | 'KEEP_DRIVE'
      | 'KEEP_LOCAL'
      | 'KEEP_BOTH_RENAME_LOCAL'
      | 'KEEP_BOTH_RENAME_DRIVE'
      | 'OPEN_DRIVE_ANYWAY'
      | 'OPEN_LOCAL_ANYWAY'
      | 'CANCEL'
  ): void => {
    if (!conflictPrompt) return
    window.electron.ipcRenderer.send(`prompt-conflict-response-${conflictPrompt.id}`, choice)
    setConflictPrompt(null)
    setTimeout(reloadAllData, 500)
  }

  // Trigger manual conflict resolution popup
  const handleResolveConflictManual = async (docId: string): Promise<void> => {
    try {
      await window.electron.ipcRenderer.invoke('documents:resolve-conflict-manual', docId)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="max-w-5xl w-full mx-auto p-6 flex flex-col gap-8 min-h-screen">
      {/* P1.3: File processing overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md">
          <div className="flex flex-col items-center gap-5 p-8 rounded-2xl border border-white/10 bg-slate-900/70 shadow-2xl max-w-sm w-full mx-4">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-400 animate-spin" />
              <div className="absolute inset-2 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-white">Uploading to Google Drive...</p>
              {processingFile && (
                <p className="text-xs text-slate-400 mt-1 font-mono truncate max-w-xs">{processingFile}</p>
              )}
              <p className="text-[11px] text-slate-500 mt-2">Waiting for Drive sync before opening online</p>
            </div>
          </div>
        </div>
      )}
      {/* Header */}

      <header className="flex items-center justify-between p-5 rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
            <svg
              className="w-8 h-8 text-indigo-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 22H22L12 2Z" />
              <circle cx="12" cy="14" r="3" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent tracking-tight">
              Google Drive Smart Opener
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time Folder Mapping & Conflict Resolution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isOnline ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]"></span>
              Sync Active
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_#fbbf24]"></span>
              Offline Mode
            </div>
          )}
          <button
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold text-slate-300 transition-all duration-200 flex items-center gap-2"
            onClick={async (): Promise<void> => {
              await window.electron.ipcRenderer.invoke('dialog:open-file')
            }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
              />
            </svg>
            Open File...
          </button>
        </div>
      </header>

      {/* Google Drive Root Info Banner */}
      {driveRootInfo && (
        <div className="flex items-center justify-between p-4 px-6 rounded-2xl border border-white/5 bg-slate-900/25 backdrop-blur-xl shadow-lg">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20">
              <svg
                className="w-5 h-5"
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
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Google Drive Root Path
              </span>
              <span className="text-xs font-mono text-slate-300 truncate block">
                {driveRootInfo.path || 'Not Configured'}
              </span>
            </div>
          </div>
          <div className="flex gap-2 ml-4">
            <button
              onClick={(): void => setShowSetupModal(true)}
              className="px-4 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all duration-200"
            >
              Change Path
            </button>
            <button
              onClick={handleClearCache}
              className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-bold text-red-400 hover:text-red-300 transition-all duration-200"
            >
              Clear Cache
            </button>
          </div>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="flex border-b border-white/5 gap-2">
        <button
          onClick={(): void => setActiveTab('documents')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'documents'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Document Connections ({allDocs.length})
        </button>
        <button
          onClick={(): void => setActiveTab('conflicts')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'conflicts'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Conflict Center
          {conflicts.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
              {conflicts.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Content Areas */}
      <main className="flex flex-col gap-4">
        {activeTab === 'documents' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Linked Documents Index
            </h2>
            <DocumentTree
              docs={allDocs}
              driveRootPath={driveRootInfo?.path ?? null}
              expandedPaths={expandedPaths}
              onToggle={handleTogglePath}
            />
          </div>
        )}

        {activeTab === 'conflicts' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Active Sync Conflicts
            </h2>
            {conflicts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 rounded-2xl border border-dashed border-white/5 bg-slate-900/10 text-center gap-4">
                <div className="text-4xl text-emerald-400">✓</div>
                <p className="text-sm text-slate-500 max-w-xs">
                  Zero active conflicts. Everything is healthy and in-sync.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {conflicts.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-5 rounded-2xl border border-red-500/10 bg-red-500/5 hover:bg-red-500/10 transition-all group"
                  >
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                          Conflict Detected
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">ID: {doc.id}</span>
                      </div>
                      <div className="flex flex-col gap-1 text-xs font-mono text-slate-300 break-all">
                        <div className="flex items-start justify-between gap-3 group/path">
                          <div className="min-w-0 flex-1">
                            <strong className="text-slate-500">Local original:</strong>{' '}
                            {doc.localOriginalPath}
                          </div>
                          {doc.localOriginalPath && (
                            <button
                              onClick={(): void => {
                                window.electron.ipcRenderer.invoke(
                                  'dialog:show-in-folder',
                                  doc.localOriginalPath
                                )
                              }}
                              className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 transition-all duration-150 shrink-0"
                              title="Open containing folder"
                            >
                              <svg
                                className="w-3 h-3"
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
                        <div className="flex items-start justify-between gap-3 group/path">
                          <div className="min-w-0 flex-1">
                            <strong className="text-slate-500">Drive mirror:</strong> {doc.drivePath}
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md shadow-red-500/10 transition-all shrink-0 ml-4"
                      onClick={(): Promise<void> => handleResolveConflictManual(doc.id)}
                    >
                      Resolve Conflict
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: Single Candidate Prompt */}
      <ModalSingle
        isOpen={!!singlePrompt}
        localPath={singlePrompt?.localPath || ''}
        candidate={singlePrompt?.candidate!}
        onRespond={respondSingle}
      />

      {/* MODAL: Multiple Candidates Picker */}
      <ModalMultiple
        isOpen={!!multiplePrompt}
        localPath={multiplePrompt?.localPath || ''}
        candidates={multiplePrompt?.candidates || []}
        onRespond={respondMultiple}
      />

      {/* MODAL: Conflict Resolution Choice Panel */}
      <ModalConflict
        isOpen={!!conflictPrompt}
        localPath={conflictPrompt?.localPath || ''}
        document={conflictPrompt?.document!}
        onRespond={respondConflict}
      />

      {/* Onboarding / Setup Google Drive Root Modal */}
      <ModalSetup
        isOpen={showSetupModal}
        driveRootInfo={driveRootInfo}
        onSave={handleSaveSetupPath}
        onCancel={(): void => setShowSetupModal(false)}
      />
    </div>
  )
}

export default App
