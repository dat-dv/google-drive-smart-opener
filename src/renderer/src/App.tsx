import React, { useState, useEffect } from 'react'

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

interface TreeNode {
  name: string
  path: string
  type: 'directory' | 'file'
  document?: Document
  children: { [name: string]: TreeNode }
}

const buildDocTree = (docs: Document[]): TreeNode => {
  const root: TreeNode = {
    name: 'Google Drive',
    path: 'My Drive',
    type: 'directory',
    children: {}
  }

  for (const doc of docs) {
    const parts = doc.drivePath.split('/').filter(Boolean)
    let current = root
    let accumulatedPath = 'My Drive'

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (i === 0 && (part === 'My Drive' || part === 'Shared Drives' || part === 'Google Drive')) {
        continue
      }
      accumulatedPath = `${accumulatedPath}/${part}`
      const isLast = i === parts.length - 1

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: accumulatedPath,
          type: isLast ? 'file' : 'directory',
          document: isLast ? doc : undefined,
          children: {}
        }
      }
      current = current.children[part]
    }
  }

  return root
}

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'documents' | 'conflicts'>('documents')
  const [conflicts, setConflicts] = useState<Document[]>([])
  const [allDocs, setAllDocs] = useState<Document[]>([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({ 'My Drive': true })

  // Google Drive Root Configuration settings states
  const [driveRootInfo, setDriveRootInfo] = useState<{
    path: string
    isConfigured: boolean
  } | null>(null)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [setupPathInput, setSetupPathInput] = useState('')

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

  const renderTreeNode = (node: TreeNode, depth = 0): React.JSX.Element => {
    const isExpanded = !!expandedPaths[node.path]
    const hasChildren = Object.keys(node.children).length > 0

    const handleToggle = (): void => {
      if (node.type === 'directory') {
        setExpandedPaths((prev) => ({
          ...prev,
          [node.path]: !prev[node.path]
        }))
      }
    }

    const fileIcon = (filename: string): React.JSX.Element => {
      const ext = filename.split('.').pop()?.toLowerCase() || ''
      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        return (
          <span className="p-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20 text-[10px] font-bold shrink-0">
            XLS
          </span>
        )
      }
      if (['docx', 'doc', 'txt', 'md'].includes(ext)) {
        return (
          <span className="p-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20 text-[10px] font-bold shrink-0">
            DOC
          </span>
        )
      }
      if (ext === 'pdf') {
        return (
          <span className="p-1 bg-red-500/10 text-red-400 rounded border border-red-500/20 text-[10px] font-bold shrink-0">
            PDF
          </span>
        )
      }
      return (
        <svg
          className="w-4 h-4 text-indigo-400 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      )
    }

    return (
      <div key={node.path || node.name} className="flex flex-col select-none">
        {/* Node Header Row */}
        <div
          onClick={handleToggle}
          className={`flex items-center justify-between py-2 px-3 rounded-xl border border-transparent transition-all duration-150 ${
            node.type === 'directory'
              ? 'hover:bg-white/5 cursor-pointer'
              : 'hover:bg-slate-900/40 hover:border-indigo-500/20'
          }`}
          style={{ paddingLeft: `${Math.max(12, depth * 20)}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {node.type === 'directory' ? (
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Collapse / Expand Arrow */}
                <svg
                  className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {/* Folder Icon */}
                <svg
                  className="w-4.5 h-4.5 text-amber-400 shrink-0"
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
            ) : (
              <div className="flex items-center gap-2 shrink-0 pl-5">{fileIcon(node.name)}</div>
            )}
            <span
              className={`text-sm truncate ${node.type === 'directory' ? 'font-bold text-slate-300' : 'text-slate-200 font-mono text-xs'}`}
            >
              {node.name}
            </span>
          </div>

          {/* Metadata & Actions for files */}
          {node.type === 'file' && node.document && (
            <div className="flex items-center gap-3 shrink-0 ml-4">
              {/* File size & Last opened */}
              <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                {node.document.metadata?.size
                  ? `${(node.document.metadata.size / 1024).toFixed(1)} KB`
                  : ''}
              </span>
              <span className="text-[10px] text-slate-500 hidden lg:inline">
                {node.document.lastOpened
                  ? `Opened: ${new Date(node.document.lastOpened).toLocaleDateString()}`
                  : ''}
              </span>

              {/* Status Badge */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  node.document.status === 'LINKED'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : node.document.status === 'CONFLICT'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {node.document.status}
              </span>

              {/* Action Button: open local file */}
              {node.document.localOriginalPath && (
                <button
                  onClick={(e): void => {
                    e.stopPropagation()
                    window.electron.ipcRenderer.invoke(
                      'dialog:open-file-path',
                      node.document!.localOriginalPath
                    )
                  }}
                  className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 transition-all duration-150"
                  title="Open local file with Google Drive"
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
              )}
            </div>
          )}
        </div>

        {/* Children Render */}
        {node.type === 'directory' && hasChildren && isExpanded && (
          <div className="flex flex-col">
            {(Object.values(node.children) as TreeNode[])
              .sort((a, b) => {
                if (a.type !== b.type) {
                  return a.type === 'directory' ? -1 : 1
                }
                return a.name.localeCompare(b.name)
              })
              .map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Load Google Drive root path info
  const loadDriveRootInfo = async (): Promise<void> => {
    try {
      const info = await window.electron.ipcRenderer.invoke('settings:get-drive-root')
      setDriveRootInfo(info)
      setSetupPathInput(info.path || '')
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

    const unsubShowSetup = window.electron.ipcRenderer.on('show-setup-modal', () => {
      setShowSetupModal(true)
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
    try {
      const validation = await window.electron.ipcRenderer.invoke(
        'settings:validate-drive-root',
        setupPathInput
      )
      if (!validation.valid) {
        alert(`Error: ${validation.warning}`)
        return
      }

      if (validation.warning) {
        const confirmSave = confirm(`${validation.warning}\n\nDo you want to use this path anyway?`)
        if (!confirmSave) return
      }

      await window.electron.ipcRenderer.invoke('settings:set-drive-root', setupPathInput)
      setShowSetupModal(false)
      loadDriveRootInfo()
      reloadAllData()
    } catch (err) {
      alert(
        `Error setting Google Drive root path: ${err instanceof Error ? err.message : String(err)}`
      )
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
      window.electron.ipcRenderer.send(`prompt-multiple-candidates-response-${multiplePrompt.id}`, {
        action
      })
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
            {allDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 rounded-2xl border border-dashed border-white/5 bg-slate-900/10 text-center gap-4">
                <div className="text-4xl">📄</div>
                <p className="text-sm text-slate-500 max-w-xs">
                  No linked documents in index. Open local files to synchronize them with Google
                  Drive.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl border border-white/5 bg-slate-900/25 backdrop-blur-xl flex flex-col gap-1 max-h-[600px] overflow-y-auto">
                {renderTreeNode(buildDocTree(allDocs))}
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
                          <strong className="text-slate-500">Local original:</strong>{' '}
                          {doc.localOriginalPath}
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
                  <strong className="text-slate-500">Drive:</strong>{' '}
                  {singlePrompt.candidate.drivePath}
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
                    <span className="text-xs font-medium font-mono truncate mr-4">
                      {c.drivePath}
                    </span>
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
                Both local and Drive copies have been modified independently. Select a resolution
                strategy:
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
                    <span className="text-sm font-bold text-slate-200">
                      Keep Both (Rename Local)
                    </span>
                    <span className="text-xs text-slate-500">
                      Rename local to &quot;file (Local Conflict)&quot; and upload as new.
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
                  onClick={(): void => respondConflict('OPEN_DRIVE_ANYWAY')}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-slate-200">
                      Open Drive Version Anyway
                    </span>
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
                    <span className="text-sm font-bold text-slate-200">
                      Open Local Version Anyway
                    </span>
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
      {/* Onboarding / Setup Google Drive Root Modal */}
      {showSetupModal && (
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
                Google Drive for Desktop syncs your cloud files locally. To read the file metadata
                (Item IDs) and map folders, the app needs to know your local Google Drive root
                folder path.
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
                {!driveRootInfo?.isConfigured && (
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
                    onClick={(): void => setShowSetupModal(false)}
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
      )}
    </div>
  )
}

export default App
