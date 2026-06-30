import React, { useState, useEffect } from 'react'

interface FolderMapping {
  id: string
  localFolderPath: string
  driveFolderPath: string
  createdAt: string
  updatedAt: string
  status: 'ACTIVE' | 'INACTIVE'
}

interface Document {
  id: string
  drivePath: string
  localOriginalPath: string | null
  driveHash: string | null
  localHash: string | null
  status: string
  lastOpened: string | null
  metadata: {
    size?: number
    mimeType?: string
    provider?: string
    offlinePending?: boolean
  }
}

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'mappings' | 'documents' | 'conflicts'>('mappings')
  const [mappings, setMappings] = useState<FolderMapping[]>([])
  const [conflicts, setConflicts] = useState<Document[]>([])
  const [allDocs, setAllDocs] = useState<Document[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [localPathInput, setLocalPathInput] = useState('')
  const [drivePathInput, setDrivePathInput] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)

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
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)

  const [conflictPrompt, setConflictPrompt] = useState<{
    id: string
    localPath: string
    document: Document
  } | null>(null)

  // Load Folder Mappings
  const loadMappings = async (): Promise<void> => {
    try {
      const list = await window.electron.ipcRenderer.invoke('mappings:list')
      setMappings(list || [])
    } catch (err) {
      console.error('Failed to load mappings:', err)
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
    loadMappings()
    loadConflicts()
    loadAllDocs()
  }

  useEffect(() => {
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
        if (data.candidates && data.candidates.length > 0) {
          setSelectedCandidateId(data.candidates[0].id)
        }
      }
    )

    const unsubConflict = window.electron.ipcRenderer.on(
      'prompt-conflict',
      (_, data: { id: string; localPath: string; document: Document }) => {
        setConflictPrompt(data)
      }
    )

    // Signal to main process that React has fully mounted and all IPC listeners are active.
    // Main process waits for this before flushing the startup file queue.
    window.electron.ipcRenderer.send('renderer-ready')

    return (): void => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (typeof unsubSingle === 'function') unsubSingle()
      if (typeof unsubMultiple === 'function') unsubMultiple()
      if (typeof unsubConflict === 'function') unsubConflict()
    }
  }, [])

  // Folder selector trigger
  const handleSelectLocalFolder = async (): Promise<void> => {
    try {
      const path = await window.electron.ipcRenderer.invoke('dialog:select-folder')
      if (path) {
        setLocalPathInput(path)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Submit new mapping creation
  const handleAddMappingSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!localPathInput || !drivePathInput) return

    try {
      await window.electron.ipcRenderer.invoke('mappings:create', localPathInput, drivePathInput)
      setShowAddModal(false)
      setLocalPathInput('')
      setDrivePathInput('')
      reloadAllData()
    } catch (err) {
      console.error(err)
    }
  }

  // Delete mapping
  const handleDeleteMapping = async (id: string): Promise<void> => {
    try {
      await window.electron.ipcRenderer.invoke('mappings:delete', id)
      reloadAllData()
    } catch (err) {
      console.error(err)
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
  const respondMultiple = (action: 'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL'): void => {
    if (!multiplePrompt) return
    if (action === 'OPEN_DRIVE') {
      const selected = multiplePrompt.candidates.find((c) => c.id === selectedCandidateId)
      if (!selected) return
      window.electron.ipcRenderer.send(`prompt-multiple-candidates-response-${multiplePrompt.id}`, {
        action,
        selected
      })
    } else {
      window.electron.ipcRenderer.send(
        `prompt-multiple-candidates-response-${multiplePrompt.id}`,
        { action }
      )
    }
    setMultiplePrompt(null)
    setSelectedCandidateId(null)
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
      {/* Header */}
      <header className="flex items-center justify-between p-5 rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
            <svg className="w-8 h-8 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
            Open File...
          </button>
          <button
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            onClick={(): void => setShowAddModal(true)}
          >
            Add Mapping
          </button>
        </div>
      </header>

      {/* Tabs Menu */}
      <div className="flex border-b border-white/5 gap-2">
        <button
          onClick={(): void => setActiveTab('mappings')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'mappings'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Folder Mappings ({mappings.length})
        </button>
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
        {activeTab === 'mappings' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Active Folder Mappings
            </h2>
            {mappings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 rounded-2xl border border-dashed border-white/5 bg-slate-900/10 text-center gap-4">
                <div className="text-4xl">📁</div>
                <p className="text-sm text-slate-500 max-w-xs">
                  No active mappings found. Click "Add Mapping" to establish a connection folder.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {mappings.map((mapping) => (
                  <div
                    key={mapping.id}
                    className="flex items-center justify-between p-5 rounded-2xl border border-white/5 bg-slate-900/25 hover:bg-slate-900/40 hover:border-indigo-500/20 transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-6 flex-1 min-w-0">
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Local Workspace Path
                        </span>
                        <span className="text-sm text-slate-300 truncate font-mono bg-slate-950/20 px-2.5 py-1 rounded-lg border border-white/5">
                          {mapping.localFolderPath}
                        </span>
                      </div>
                      <div className="text-indigo-400 font-bold self-center pt-4">➔</div>
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Google Drive Mirror Path
                        </span>
                        <span className="text-sm text-slate-300 truncate font-mono bg-slate-950/20 px-2.5 py-1 rounded-lg border border-white/5">
                          {mapping.driveFolderPath}
                        </span>
                      </div>
                    </div>
                    <button
                      className="p-2 ml-4 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 opacity-60 group-hover:opacity-100"
                      title="Remove mapping"
                      onClick={(): Promise<void> => handleDeleteMapping(mapping.id)}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Linked Documents Index
            </h2>
            {allDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 rounded-2xl border border-dashed border-white/5 bg-slate-900/10 text-center gap-4">
                <div className="text-4xl">📄</div>
                <p className="text-sm text-slate-500 max-w-xs">
                  No linked documents in index. Open local files inside mapping paths to synchronize them.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/5 bg-slate-900/20 backdrop-blur-xl">
                <table className="w-full border-collapse text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/45 text-xs font-semibold uppercase text-slate-400 border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4">Drive Path</th>
                      <th className="px-6 py-4">Local Original Location</th>
                      <th className="px-6 py-4">Last Opened</th>
                      <th className="px-6 py-4">Sync Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {allDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-white/2 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs max-w-xs truncate text-slate-200">
                          {doc.drivePath}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs max-w-xs truncate text-slate-400">
                          {doc.localOriginalPath || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {doc.lastOpened ? new Date(doc.lastOpened).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              doc.status === 'LINKED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : doc.status === 'CONFLICT'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : doc.status === 'UNLINKED'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                            }`}
                          >
                            {doc.status}
                            {doc.metadata?.offlinePending && (
                              <span className="text-[9px] text-amber-500 font-semibold lowercase">
                                (pending sync)
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                        <div>
                          <strong className="text-slate-500">Local original:</strong> {doc.localOriginalPath}
                        </div>
                        <div>
                          <strong className="text-slate-500">Drive mirror:</strong> {doc.drivePath}
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

      {/* MODAL: Add Folder Mapping */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <form
            className="w-full max-w-lg bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up"
            onSubmit={handleAddMappingSubmit}
          >
            <div className="p-6 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">Add Folder Mapping</h2>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400">Local folder to watch</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                    placeholder="/Users/username/Workspace"
                    value={localPathInput}
                    onChange={(e): void => setLocalPathInput(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold text-white transition-all"
                    onClick={handleSelectLocalFolder}
                  >
                    Browse
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400">
                  Google Drive Mirror Folder (Relative to My Drive)
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                  placeholder="My Drive/ProjectMirror"
                  value={drivePathInput}
                  onChange={(e): void => setDrivePathInput(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="p-5 bg-slate-950/20 border-t border-white/5 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-slate-300 transition-all"
                onClick={(): void => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all"
              >
                Create Link
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Single Candidate Prompt */}
      {singlePrompt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">Link to existing Drive file?</h2>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                A matching Google Drive document was found for your local file:
              </p>
              <div className="flex flex-col gap-2 p-4 rounded-xl border border-white/5 bg-slate-950/30 text-xs font-mono break-all text-slate-300">
                <div>
                  <strong className="text-slate-500">Local:</strong> {singlePrompt.localPath}
                </div>
                <div>
                  <strong className="text-slate-500">Drive:</strong> {singlePrompt.candidate.drivePath}
                </div>
              </div>
            </div>
            <div className="p-5 bg-slate-950/20 border-t border-white/5 flex items-center justify-end gap-3">
              <button
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-slate-300 transition-all"
                onClick={(): void => respondSingle('CANCEL')}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-sm font-semibold text-slate-300 transition-all"
                onClick={(): void => respondSingle('IMPORT_NEW')}
              >
                Import as New Copy
              </button>
              <button
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all"
                onClick={(): void => respondSingle('OPEN_DRIVE')}
              >
                Link & Open Drive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Multiple Candidates Picker */}
      {multiplePrompt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">Select Drive Document</h2>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Multiple matches found in Google Drive. Select which document to link:
              </p>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {multiplePrompt.candidates.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedCandidateId === c.id
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-white/5 bg-white/2 hover:bg-white/5 text-slate-300'
                    }`}
                    onClick={(): void => setSelectedCandidateId(c.id)}
                  >
                    <span className="text-xs font-medium font-mono truncate mr-4">{c.drivePath}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950/40 text-slate-500 uppercase tracking-wider font-semibold">
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 bg-slate-950/20 border-t border-white/5 flex items-center justify-end gap-3">
              <button
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-slate-300 transition-all"
                onClick={(): void => respondMultiple('CANCEL')}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-sm font-semibold text-slate-300 transition-all"
                onClick={(): void => respondMultiple('IMPORT_NEW')}
              >
                Import as New
              </button>
              <button
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
                onClick={(): void => respondMultiple('OPEN_DRIVE')}
                disabled={!selectedCandidateId}
              >
                Link & Open
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Conflict Resolution Choice Panel */}
      {conflictPrompt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-xl bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">Synchronization Conflict Detected</h2>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Both local and Drive copies have been modified independently. Select a resolution strategy:
              </p>
              <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
                {/* 1. KEEP_DRIVE */}
                <div
                  className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-emerald-500/10 hover:border-emerald-500/30 cursor-pointer transition-all duration-200"
                  onClick={(): void => respondConflict('KEEP_DRIVE')}
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
                  onClick={(): void => respondConflict('KEEP_LOCAL')}
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
                  onClick={(): void => respondConflict('KEEP_BOTH_RENAME_LOCAL')}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-slate-200">Keep Both (Rename Local)</span>
                    <span className="text-xs text-slate-500">
                      Rename local to "file (Local Conflict)" and upload as new.
                    </span>
                  </div>
                  <span className="text-lg">📁</span>
                </div>

                {/* 4. KEEP_BOTH_RENAME_DRIVE */}
                <div
                  className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-indigo-500/5 hover:border-indigo-500/20 cursor-pointer transition-all duration-200"
                  onClick={(): void => respondConflict('KEEP_BOTH_RENAME_DRIVE')}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-slate-200">Keep Both (Rename Drive Copy)</span>
                    <span className="text-xs text-slate-500">
                      Rename the old Drive copy and upload your local copy to the original path.
                    </span>
                  </div>
                  <span className="text-lg">☁️</span>
                </div>

                {/* 5. OPEN_DRIVE_ANYWAY */}
                <div
                  className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 cursor-pointer transition-all duration-200"
                  onClick={(): void => respondConflict('OPEN_DRIVE_ANYWAY')}
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
                  onClick={(): void => respondConflict('OPEN_LOCAL_ANYWAY')}
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
                onClick={(): void => respondConflict('CANCEL')}
              >
                Cancel Opening
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
