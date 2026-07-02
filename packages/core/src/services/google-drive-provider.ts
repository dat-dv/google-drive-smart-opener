import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { exec } from 'child_process'
import { Document, calculateFileMd5 } from '@shared'
import { CloudProvider, SearchQuery } from '../ports/cloud-provider'

/**
 * Concrete implementation of CloudProvider for Google Drive desktop client.
 * Interacts with the local file mirror created by Google Drive for desktop.
 */
export class GoogleDriveProvider implements CloudProvider {
  private readonly driveRootPath: string

  /**
   * Initializes the provider with the path to the local Google Drive folder.
   */
  constructor(driveRootPath: string) {
    this.driveRootPath = path.resolve(driveRootPath)
  }

  public getDriveRootPath(): string {
    return this.driveRootPath
  }

  public resolveLocalPath(drivePath: string): string {
    // If the path is already absolute, return it. Otherwise, prepend the drive root path.
    if (path.isAbsolute(drivePath)) {
      return drivePath
    }
    return path.join(this.driveRootPath, drivePath)
  }

  /**
   * Performs recursive search for candidate files matching the search query.
   * Utilizes short-circuit checks (name and size matches) to avoid calculating
   * MD5 hashes for non-matching files, maintaining optimal performance.
   */
  public async search(query: SearchQuery): Promise<Document[]> {
    const results: Document[] = []
    if (!fs.existsSync(this.driveRootPath)) {
      return results
    }

    await this.searchRecursive(this.driveRootPath, query, results)
    return results
  }

  /**
   * Scans a specific Drive folder to index all files currently inside it.
   */
  public async scanFolder(driveSubfolderPath: string): Promise<Document[]> {
    const absoluteFolderPath = this.resolveLocalPath(driveSubfolderPath)
    const results: Document[] = []

    if (!fs.existsSync(absoluteFolderPath)) {
      return results
    }

    await this.scanRecursive(absoluteFolderPath, results)
    return results
  }

  /**
   * Copies a local file into the Drive directory, handling naming collisions
   * by suffixing (1), (2), etc.
   */
  public async importFile(localFilePath: string, targetDriveFolder: string): Promise<Document> {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Source file does not exist: ${localFilePath}`)
    }

    const targetFolderAbs = this.resolveLocalPath(targetDriveFolder)

    // Ensure the destination folder exists on Google Drive
    await fs.promises.mkdir(targetFolderAbs, { recursive: true })

    const originalFilename = path.basename(localFilePath)
    let targetFilename = originalFilename
    let targetPathAbs = path.join(targetFolderAbs, targetFilename)
    let counter = 1

    // R3.3 / R13 naming collision resolution: rename report.xlsx to report (1).xlsx, etc.
    const ext = path.extname(originalFilename)
    const base = path.basename(originalFilename, ext)
    while (fs.existsSync(targetPathAbs)) {
      targetFilename = `${base} (${counter})${ext}`
      targetPathAbs = path.join(targetFolderAbs, targetFilename)
      counter++
    }

    await fs.promises.copyFile(localFilePath, targetPathAbs)

    const relativeDrivePath = path.relative(this.driveRootPath, targetPathAbs)
    const stats = await fs.promises.stat(targetPathAbs)
    const hash = await calculateFileMd5(targetPathAbs)

    return {
      id: crypto.randomUUID(),
      drivePath: relativeDrivePath,
      localOriginalPath: localFilePath,
      driveHash: hash,
      localHash: hash,
      driveModifiedTime: stats.mtime.toISOString(),
      localModifiedTime: stats.mtime.toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpened: null,
      status: 'LINKED',
      metadata: {
        size: stats.size,
        mimeType: this.guessMimeType(targetFilename),
        provider: 'google-drive'
      },
      folderMappingId: null
    }
  }

  /**
   * Resolves the correct Google web editor URL for a given file path and Drive item ID.
   * Constructs type-specific editor URLs (Docs/Sheets/Slides) instead of the generic
   * `open?id=` redirect, which lands on the Drive file preview rather than the editor.
   */
  private resolveEditorUrl(absolutePath: string, itemId: string): string {
    const ext = path.extname(absolutePath).toLowerCase()
    if (['.doc', '.docx', '.txt', '.md', '.rtf'].includes(ext)) {
      return `https://docs.google.com/document/d/${itemId}/edit`
    }
    if (['.xls', '.xlsx', '.csv'].includes(ext)) {
      return `https://docs.google.com/spreadsheets/d/${itemId}/edit`
    }
    if (['.ppt', '.pptx'].includes(ext)) {
      return `https://docs.google.com/presentation/d/${itemId}/edit`
    }
    // Fallback for PDFs, images, and other binary files
    return `https://drive.google.com/file/d/${itemId}/view`
  }

  /**
   * Opens the file on macOS.
   * When useDriveApp is true, attempts to open via Google Drive desktop app first.
   * Retries xattr read for up to 10 seconds to handle Drive sync delay after import.
   * Falls back to OS default app if Drive daemon does not provide item-id in time.
   */
  public async openFile(drivePath: string, useDriveApp = false): Promise<void> {
    const absolutePath = path.isAbsolute(drivePath) ? drivePath : this.resolveLocalPath(drivePath)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File does not exist: ${absolutePath}`)
    }

    const execCmd = (cmd: string): Promise<string> =>
      new Promise((resolve, reject) => {
        console.log(`[GoogleDriveProvider] Executing command: ${cmd}`)
        exec(cmd, (error, stdout) => (error ? reject(error) : resolve(stdout.trim())))
      })

    if (useDriveApp) {
      // P2.2: Retry loop — Drive Desktop may not have written xattr yet after a fresh import.
      // Poll up to 10 seconds (20 attempts × 500ms) before giving up and falling back.
      const MAX_ATTEMPTS = 20
      const POLL_INTERVAL_MS = 500

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const itemId = await execCmd(`xattr -p com.google.drivefs.item-id#S "${absolutePath}"`)
          if (itemId) {
            const editorUrl = this.resolveEditorUrl(absolutePath, itemId)
            console.log(
              `[GoogleDriveProvider] Found item ID ${itemId} on attempt ${attempt}. Opening: ${editorUrl}`
            )
            await execCmd(`open "${editorUrl}"`)
            return
          }
        } catch {
          // xattr not available yet — Drive hasn't synced this file yet
          if (attempt < MAX_ATTEMPTS) {
            console.log(
              `[GoogleDriveProvider] xattr not ready (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in ${POLL_INTERVAL_MS}ms...`
            )
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
          } else {
            console.warn(
              `[GoogleDriveProvider] xattr not available after ${MAX_ATTEMPTS} attempts. Falling back to default app.`
            )
          }
        }
      }
    }

    // Default: open with OS file association (Word, Pages, Preview, etc.)
    console.log(`[GoogleDriveProvider] Falling back to default OS open: ${absolutePath}`)
    await execCmd(`open "${absolutePath}"`)
  }

  /**
   * Opens the file's Google Drive web editor / viewer URL in the browser.
   */
  public async openOnline(drivePath: string): Promise<void> {
    const absolutePath = path.isAbsolute(drivePath) ? drivePath : this.resolveLocalPath(drivePath)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File does not exist: ${absolutePath}`)
    }

    const execCmd = (cmd: string): Promise<string> =>
      new Promise((resolve, reject) => {
        exec(cmd, (error, stdout) => (error ? reject(error) : resolve(stdout.trim())))
      })

    try {
      const itemId = await execCmd(`xattr -p com.google.drivefs.item-id#S "${absolutePath}"`)
      if (itemId) {
        const editorUrl = this.resolveEditorUrl(absolutePath, itemId)
        console.log(`[GoogleDriveProvider] Found item ID ${itemId} for online preview. Opening: ${editorUrl}`)
        await execCmd(`open "${editorUrl}"`)
        return
      }
    } catch (err) {
      console.warn(`[GoogleDriveProvider] Failed to read xattr for online preview: ${err instanceof Error ? err.message : String(err)}`)
    }

    throw new Error(`Google Drive Item ID not synced yet for file: ${drivePath}. Please wait for Drive desktop sync to complete.`)
  }

  /**
   * Moves a file within the Google Drive filesystem.
   */
  public async moveFile(drivePath: string, targetDriveFolder: string): Promise<void> {
    const sourceAbs = this.resolveLocalPath(drivePath)
    const targetFolderAbs = this.resolveLocalPath(targetDriveFolder)
    const targetAbs = path.join(targetFolderAbs, path.basename(drivePath))

    if (!fs.existsSync(sourceAbs)) {
      throw new Error(`Source file does not exist: ${sourceAbs}`)
    }

    await fs.promises.mkdir(targetFolderAbs, { recursive: true })
    await fs.promises.rename(sourceAbs, targetAbs)
  }

  /**
   * Recursively scans directories to look for candidate files based on search criteria.
   */
  private async searchRecursive(
    dir: string,
    query: SearchQuery,
    results: Document[]
  ): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      // Ignore common OS files and hidden directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue
      }

      if (entry.isDirectory()) {
        await this.searchRecursive(fullPath, query, results)
      } else if (entry.isFile()) {
        let isMatch = true

        // 1. Filename match (case-insensitive check)
        if (query.filename) {
          const matchName = query.filename.toLowerCase()
          const currentName = entry.name.toLowerCase()
          if (currentName !== matchName) {
            isMatch = false
          }
        }

        // Skip stat checks if name mismatch to save O(N) IO cycles
        if (!isMatch) continue

        const stats = await fs.promises.stat(fullPath)

        // 2. Size match
        if (query.fileSize !== undefined && stats.size !== query.fileSize) {
          isMatch = false
        }

        if (!isMatch) continue

        // 3. Hash match (compute hash only when name and size matched to prevent CPU bottleneck)
        const fileHash = await calculateFileMd5(fullPath)
        if (query.hash && fileHash !== query.hash) {
          isMatch = false
        }

        if (isMatch) {
          const relativePath = path.relative(this.driveRootPath, fullPath)
          results.push({
            id: crypto.randomUUID(),
            drivePath: relativePath,
            localOriginalPath: null,
            driveHash: fileHash,
            localHash: null,
            driveModifiedTime: stats.mtime.toISOString(),
            localModifiedTime: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastOpened: null,
            status: 'LINKED',
            metadata: {
              size: stats.size,
              mimeType: this.guessMimeType(entry.name),
              provider: 'google-drive'
            },
            folderMappingId: null
          })
        }
      }
    }
  }

  /**
   * Helper to perform basic recursive file indexing.
   */
  private async scanRecursive(dir: string, results: Document[]): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.name.startsWith('.')) {
        continue
      }

      if (entry.isDirectory()) {
        await this.scanRecursive(fullPath, results)
      } else if (entry.isFile()) {
        const stats = await fs.promises.stat(fullPath)
        const hash = await calculateFileMd5(fullPath)
        const relativePath = path.relative(this.driveRootPath, fullPath)

        results.push({
          id: crypto.randomUUID(),
          drivePath: relativePath,
          localOriginalPath: null,
          driveHash: hash,
          localHash: null,
          driveModifiedTime: stats.mtime.toISOString(),
          localModifiedTime: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastOpened: null,
          status: 'LINKED',
          metadata: {
            size: stats.size,
            mimeType: this.guessMimeType(entry.name),
            provider: 'google-drive'
          },
          folderMappingId: null
        })
      }
    }
  }

  /**
   * Basic MIME type deduction based on standard file extensions.
   */
  private guessMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    switch (ext) {
      case '.txt':
        return 'text/plain'
      case '.html':
        return 'text/html'
      case '.pdf':
        return 'application/pdf'
      case '.docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      case '.doc':
        return 'application/msword'
      case '.xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      case '.xls':
        return 'application/vnd.ms-excel'
      case '.pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      case '.ppt':
        return 'application/vnd.ms-powerpoint'
      case '.png':
        return 'image/png'
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg'
      case '.json':
        return 'application/json'
      default:
        return 'application/octet-stream'
    }
  }
}
