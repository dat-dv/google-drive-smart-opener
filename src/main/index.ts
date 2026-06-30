import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs'
import * as os from 'os'
import * as crypto from 'crypto'

import { DatabaseManager, SQLiteDocumentRepository, SQLiteFolderMappingRepository, SQLiteOfflineTaskRepository } from '@database'
import {
  GoogleDriveProvider,
  OpenDocumentUseCase,
  DriveWatcher,
  ConflictResolutionChoice,
  UserInteractor,
  OfflineSyncService
} from '@core'
import { Document } from '@shared'

let mainWindow: BrowserWindow | null = null
let dbManager: DatabaseManager
let docRepo: SQLiteDocumentRepository
let mappingRepo: SQLiteFolderMappingRepository
let taskRepo: SQLiteOfflineTaskRepository
let driveProvider: GoogleDriveProvider
let openDocumentUseCase: OpenDocumentUseCase
let watcher: DriveWatcher
let interactor: ElectronUserInteractor
let offlineSyncService: OfflineSyncService

const fileQueue: string[] = []

class ElectronUserInteractor implements UserInteractor {
  private win: BrowserWindow | null = null

  setWindow(win: BrowserWindow) {
    this.win = win
  }

  async promptSingleCandidate(
    localPath: string,
    candidate: Document
  ): Promise<'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL'> {
    if (!this.win) return 'CANCEL'
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      this.win!.webContents.send('prompt-single-candidate', { id, localPath, candidate })
      ipcMain.once(`prompt-single-candidate-response-${id}`, (_, response) => {
        resolve(response)
      })
    })
  }

  async promptMultipleCandidates(
    localPath: string,
    candidates: Document[]
  ): Promise<
    { action: 'OPEN_DRIVE'; selected: Document } | { action: 'IMPORT_NEW' } | { action: 'CANCEL' }
  > {
    if (!this.win) return { action: 'CANCEL' }
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      this.win!.webContents.send('prompt-multiple-candidates', { id, localPath, candidates })
      ipcMain.once(`prompt-multiple-candidates-response-${id}`, (_, response) => {
        resolve(response)
      })
    })
  }

  async promptConflict(localPath: string, document: Document): Promise<ConflictResolutionChoice> {
    if (!this.win) return 'CANCEL'
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      this.win!.webContents.send('prompt-conflict', { id, localPath, document })
      ipcMain.once(`prompt-conflict-response-${id}`, (_, response) => {
        resolve(response)
      })
    })
  }
}

function getGoogleDriveRoot(): string {
  const home = os.homedir()
  const cloudStoragePath = join(home, 'Library/CloudStorage')
  if (fs.existsSync(cloudStoragePath)) {
    const folders = fs.readdirSync(cloudStoragePath)
    const driveFolder = folders.find((f) => f.toLowerCase().includes('googledrive'))
    if (driveFolder) {
      return join(cloudStoragePath, driveFolder)
    }
  }
  const fallback = join(home, 'Google Drive')
  if (!fs.existsSync(fallback)) {
    fs.mkdirSync(fallback, { recursive: true })
  }
  return fallback
}

function handleOpenFile(filePath: string): void {
  if (!mainWindow) {
    fileQueue.push(filePath)
    return
  }

  openDocumentUseCase
    .execute(filePath)
    .then((result) => {
      if (result.type === 'OPENED') {
        console.log(`[Smart Opener] Opened document: ${result.document.drivePath}`)
      } else if (result.type === 'CANCELLED') {
        console.log(`[Smart Opener] Cancelled opening: ${filePath}`)
      } else {
        dialog.showErrorBox('Error', `File not found: ${result.localPath}`)
      }
    })
    .catch((err) => {
      dialog.showErrorBox('Error', `Failed to open document: ${err.message}`)
    })
}

// Early registration of macOS open-file event (R7)
let fileToOpenOnStartup: string | null = null
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (app.isReady()) {
    handleOpenFile(filePath)
  } else {
    fileToOpenOnStartup = filePath
  }
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  interactor.setWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()

    // Flush any files clicked during cold start
    if (fileToOpenOnStartup) {
      handleOpenFile(fileToOpenOnStartup)
      fileToOpenOnStartup = null
    }
    while (fileQueue.length > 0) {
      const file = fileQueue.shift()
      if (file) handleOpenFile(file)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Parse process.argv for initial file to open (R7/Testing support)
  const args = process.argv.slice(is.dev ? 2 : 1)
  const fileArg = args.find((arg) => !arg.startsWith('-') && fs.existsSync(arg) && fs.statSync(arg).isFile())
  if (fileArg) {
    fileToOpenOnStartup = fileArg
  }

  // Initialize DB and repositories
  const dbPath = join(app.getPath('userData'), 'database.sqlite')
  dbManager = new DatabaseManager(dbPath)
  dbManager.connect()

  docRepo = new SQLiteDocumentRepository(() => dbManager.getDatabase())
  mappingRepo = new SQLiteFolderMappingRepository(() => dbManager.getDatabase())
  taskRepo = new SQLiteOfflineTaskRepository(() => dbManager.getDatabase())

  const driveRoot = getGoogleDriveRoot()
  driveProvider = new GoogleDriveProvider(driveRoot)
  interactor = new ElectronUserInteractor()

  openDocumentUseCase = new OpenDocumentUseCase(docRepo, driveProvider, interactor, taskRepo)
  offlineSyncService = new OfflineSyncService(taskRepo, docRepo, driveProvider)

  // Start Realtime Drive Watcher (M5)
  watcher = new DriveWatcher(docRepo, mappingRepo, driveProvider)
  await watcher.start()

  // Register network status event listener
  ipcMain.on('network-status:changed', async (_, online: boolean) => {
    openDocumentUseCase.setOnlineStatus(online)
    if (online) {
      console.log('[OfflineSync] Online status detected. Running synchronization worker...')
      await offlineSyncService.sync()
    }
  })

  // Register Mapping Service IPC Handlers (M8)
  ipcMain.handle('mappings:list', async () => {
    return mappingRepo.list()
  })

  ipcMain.handle('mappings:create', async (_, localFolderPath, driveFolderPath) => {
    const mapping = {
      id: crypto.randomUUID(),
      localFolderPath,
      driveFolderPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ACTIVE' as const
    }
    await mappingRepo.create(mapping)
    await watcher.watchMapping(mapping)
    return mapping
  })

  ipcMain.handle('mappings:delete', async (_, id) => {
    const mapping = await mappingRepo.findById(id)
    if (mapping) {
      await watcher.unwatchMapping(mapping.id)
      await mappingRepo.delete(id)
      return true
    }
    return false
  })

  ipcMain.handle('dialog:select-folder', async () => {
    if (!mainWindow) return null
    const result = dialog.showOpenDialogSync(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result ? result[0] : null
  })

  // Register Document & Conflict Center IPC Handlers (M10)
  ipcMain.handle('documents:list-conflicts', async () => {
    const list = await docRepo.list()
    return list.filter((d) => d.status === 'CONFLICT')
  })

  ipcMain.handle('documents:list-all', async () => {
    return docRepo.list()
  })

  ipcMain.handle('documents:resolve-conflict-manual', async (_, docId) => {
    const doc = await docRepo.findById(docId)
    if (doc && doc.localOriginalPath) {
      // Execute in background so IPC call resolves immediately, letting modal pop up via interactor
      openDocumentUseCase.resolveConflict(doc.localOriginalPath, doc)
      return true
    }
    return false
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  if (watcher) {
    await watcher.stop()
  }
  if (dbManager) {
    dbManager.disconnect()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
