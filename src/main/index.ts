import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs'
import * as os from 'os'
import * as crypto from 'crypto'

import { DatabaseManager, SQLiteDocumentRepository, SQLiteFolderMappingRepository } from '@database'
import {
  GoogleDriveProvider,
  OpenDocumentUseCase,
  DriveWatcher,
  ConflictResolutionChoice,
  UserInteractor
} from '@core'
import { Document } from '@shared'

let mainWindow: BrowserWindow | null = null
let dbManager: DatabaseManager
let docRepo: SQLiteDocumentRepository
let mappingRepo: SQLiteFolderMappingRepository
let driveProvider: GoogleDriveProvider
let openDocumentUseCase: OpenDocumentUseCase
let watcher: DriveWatcher
let interactor: ElectronUserInteractor

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

  // Initialize DB and repositories
  const dbPath = join(app.getPath('userData'), 'database.sqlite')
  dbManager = new DatabaseManager(dbPath)
  dbManager.connect()

  docRepo = new SQLiteDocumentRepository(() => dbManager.getDatabase())
  mappingRepo = new SQLiteFolderMappingRepository(() => dbManager.getDatabase())

  const driveRoot = getGoogleDriveRoot()
  driveProvider = new GoogleDriveProvider(driveRoot)
  interactor = new ElectronUserInteractor()

  openDocumentUseCase = new OpenDocumentUseCase(docRepo, driveProvider, interactor)

  // Start Realtime Drive Watcher (M5)
  watcher = new DriveWatcher(docRepo, mappingRepo, driveProvider)
  await watcher.start()

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
