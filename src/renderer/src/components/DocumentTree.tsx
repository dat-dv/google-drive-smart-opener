import React from 'react'
import type { Document } from '@shared/types'
import { ShowInFolderButton } from './Modals'

interface TreeNode {
  name: string
  path: string
  type: 'directory' | 'file'
  document?: Document
  children: { [name: string]: TreeNode }
}

/**
 * Builds a tree structure from a flat list of Documents keyed by drivePath.
 * Root is always 'My Drive'.
 */
export function buildDocTree(docs: Document[]): TreeNode {
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

/** Returns a badge or icon element representing the file extension. */
function FileIcon({ filename }: { filename: string }): React.JSX.Element {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return (
      <span className="p-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20 text-[10px] font-bold shrink-0">
        XLS
      </span>
    )
  }
  if (['docx', 'doc'].includes(ext)) {
    return (
      <span className="p-1 bg-indigo-500/10 text-indigo-400 rounded border border-indigo-500/20 text-[10px] font-bold shrink-0">
        DOC
      </span>
    )
  }
  if (['pptx', 'ppt'].includes(ext)) {
    return (
      <span className="p-1 bg-orange-500/10 text-orange-400 rounded border border-orange-500/20 text-[10px] font-bold shrink-0">
        PPT
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

interface TreeNodeProps {
  node: TreeNode
  depth?: number
  driveRootPath: string | null
  expandedPaths: Record<string, boolean>
  onToggle: (path: string) => void
}

/**
 * Recursively renders a single tree node (directory or file) with
 * action buttons and metadata. Kept as a pure component to enable
 * future memoisation without touching App.tsx logic.
 */
export function TreeNodeRow({
  node,
  depth = 0,
  driveRootPath,
  expandedPaths,
  onToggle
}: TreeNodeProps): React.JSX.Element {
  const isExpanded = !!expandedPaths[node.path]
  const hasChildren = Object.keys(node.children).length > 0

  const resolveMirrorPath = (drivePath: string): string => {
    if (!driveRootPath) return drivePath
    const root = driveRootPath.replace(/[/\\]$/, '')
    const rel = drivePath.replace(/^[/\\]/, '')
    return `${root}/${rel}`
  }

  return (
    <div key={node.path || node.name} className="flex flex-col select-none">
      {/* Node Header Row */}
      <div
        onClick={(): void => {
          if (node.type === 'directory') onToggle(node.path)
        }}
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
              <svg
                className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
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
            <div className="flex items-center gap-2 shrink-0 pl-5">
              {/* Local Folder Button */}
              <ShowInFolderButton
                filePath={node.document?.localOriginalPath ?? null}
                title="Open containing folder of local file"
              />
              {/* Drive Mirror Folder Button */}
              {node.document?.drivePath && driveRootPath && (
                <button
                  onClick={(e): void => {
                    e.stopPropagation()
                    window.electron.ipcRenderer.invoke(
                      'dialog:show-in-folder',
                      resolveMirrorPath(node.document!.drivePath)
                    )
                  }}
                  className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-indigo-400 transition-all duration-150 shrink-0"
                  title="Open containing folder of Google Drive mirror"
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
                      d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                    />
                  </svg>
                </button>
              )}
              <FileIcon filename={node.name} />
            </div>
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
              if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
              return a.name.localeCompare(b.name)
            })
            .map((child) => (
              <TreeNodeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                driveRootPath={driveRootPath}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
              />
            ))}
        </div>
      )}
    </div>
  )
}

/** Props for the full document tree panel. */
export interface DocumentTreeProps {
  docs: Document[]
  driveRootPath: string | null
  expandedPaths: Record<string, boolean>
  onToggle: (path: string) => void
}

/** Top-level document tree panel. Renders empty state or the full tree. */
export function DocumentTree({
  docs,
  driveRootPath,
  expandedPaths,
  onToggle
}: DocumentTreeProps): React.JSX.Element {
  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 rounded-2xl border border-dashed border-white/5 bg-slate-900/10 text-center gap-4">
        <div className="text-4xl">📄</div>
        <p className="text-sm text-slate-500 max-w-xs">
          No linked documents in index. Open local files to synchronize them with Google Drive.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-2xl border border-white/5 bg-slate-900/25 backdrop-blur-xl flex flex-col gap-1 max-h-[600px] overflow-y-auto">
      <TreeNodeRow
        node={buildDocTree(docs)}
        driveRootPath={driveRootPath}
        expandedPaths={expandedPaths}
        onToggle={onToggle}
      />
    </div>
  )
}
