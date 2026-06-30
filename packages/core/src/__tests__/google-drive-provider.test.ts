import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { GoogleDriveProvider } from '../services/google-drive-provider'
import { exec } from 'child_process'

// Mock exec to prevent real macOS file open triggers during testing
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd, cb: (err: Error | null) => void) => {
    cb(null)
  })
}))

describe('GoogleDriveProvider Integration Tests', () => {
  let tempDir: string
  let provider: GoogleDriveProvider

  beforeEach(() => {
    // Setup clean, unique temporary directory for each test run
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-provider-test-'))
    provider = new GoogleDriveProvider(tempDir)
  })

  afterEach(() => {
    // Cleanup temporary files and directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    vi.clearAllMocks()
  })

  describe('Paths resolution', () => {
    it('should resolve drive root path correctly', () => {
      expect(provider.getDriveRootPath()).toBe(path.resolve(tempDir))
    })

    it('should resolve relative drive paths to absolute paths', () => {
      const relPath = 'My Drive/folder/file.txt'
      const expected = path.join(path.resolve(tempDir), relPath)
      expect(provider.resolveLocalPath(relPath)).toBe(expected)
    })

    it('should return absolute path unchanged during resolution', () => {
      const absPath = '/absolute/path/file.txt'
      expect(provider.resolveLocalPath(absPath)).toBe(absPath)
    })
  })

  describe('Scanning and Searching', () => {
    beforeEach(() => {
      // Create nested test structure
      fs.mkdirSync(path.join(tempDir, 'My Drive'), { recursive: true })
      fs.writeFileSync(path.join(tempDir, 'My Drive/file1.txt'), 'Hello world') // MD5: 3e25960a79dbc69b674cd4ec67a72c62
      fs.writeFileSync(path.join(tempDir, 'My Drive/file2.xlsx'), 'Grid content')
      fs.mkdirSync(path.join(tempDir, 'My Drive/Sub'), { recursive: true })
      fs.writeFileSync(path.join(tempDir, 'My Drive/Sub/file3.txt'), 'Hello world') // Same content/hash
    })

    it('should scan directories recursively and extract files metadata', async () => {
      const docs = await provider.scanFolder('My Drive')
      expect(docs.length).toBe(3)

      const file1 = docs.find((d) => d.drivePath === 'My Drive/file1.txt')
      expect(file1).toBeDefined()
      expect(file1?.metadata.size).toBe(11)
      expect(file1?.metadata.mimeType).toBe('text/plain')
      expect(file1?.driveHash).toBe('3e25960a79dbc69b674cd4ec67a72c62')
    })

    it('should search files by name (case-insensitive)', async () => {
      const results = await provider.search({ filename: 'file1.txt' })
      expect(results.length).toBe(1)
      expect(results[0].drivePath).toBe('My Drive/file1.txt')
    })

    it('should search files by checksum hash', async () => {
      const results = await provider.search({ hash: '3e25960a79dbc69b674cd4ec67a72c62' })
      // Both file1.txt and Sub/file3.txt contain the same text
      expect(results.length).toBe(2)
      expect(results.map((r) => r.drivePath)).toContain('My Drive/file1.txt')
      expect(results.map((r) => r.drivePath)).toContain('My Drive/Sub/file3.txt')
    })

    it('should filter candidate searches combining filename, size, and hash', async () => {
      const results = await provider.search({
        filename: 'file1.txt',
        fileSize: 11,
        hash: '3e25960a79dbc69b674cd4ec67a72c62'
      })
      expect(results.length).toBe(1)
      expect(results[0].drivePath).toBe('My Drive/file1.txt')
    })
  })

  describe('File Management Operations', () => {
    it('should import local files and resolve name collisions with indices', async () => {
      // Create a dummy source local file outside of Drive
      const localFileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-source-'))
      const localFilePath = path.join(localFileDir, 'report.docx')
      fs.writeFileSync(localFilePath, 'Word Document Data')

      // Import into Drive
      const doc1 = await provider.importFile(localFilePath, 'My Drive/Reports')
      expect(doc1.drivePath).toBe('My Drive/Reports/report.docx')
      expect(fs.existsSync(path.join(tempDir, 'My Drive/Reports/report.docx'))).toBe(true)

      // Import again to test collision R3.3 (should name to report (1).docx)
      const doc2 = await provider.importFile(localFilePath, 'My Drive/Reports')
      expect(doc2.drivePath).toBe('My Drive/Reports/report (1).docx')
      expect(fs.existsSync(path.join(tempDir, 'My Drive/Reports/report (1).docx'))).toBe(true)

      // Cleanup source
      fs.rmSync(localFileDir, { recursive: true, force: true })
    })

    it('should move files inside the drive root', async () => {
      fs.mkdirSync(path.join(tempDir, 'Folder A'), { recursive: true })
      const fileSrc = path.join(tempDir, 'Folder A/item.txt')
      fs.writeFileSync(fileSrc, 'Secret Text')

      await provider.moveFile('Folder A/item.txt', 'Folder B')
      expect(fs.existsSync(fileSrc)).toBe(false)
      expect(fs.existsSync(path.join(tempDir, 'Folder B/item.txt'))).toBe(true)
    })

    it('should trigger OS default application open command for files', async () => {
      const fileSrc = path.join(tempDir, 'doc.pdf')
      fs.writeFileSync(fileSrc, 'PDF content')

      await expect(provider.openFile('doc.pdf')).resolves.toBeUndefined()
      expect(exec).toHaveBeenCalledWith(`open "${path.resolve(fileSrc)}"`, expect.any(Function))
    })
  })
})
