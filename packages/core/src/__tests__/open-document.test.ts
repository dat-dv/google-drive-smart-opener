import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { DatabaseManager } from '@database'
import { SQLiteDocumentRepository } from '@database'
import { GoogleDriveProvider } from '../services/google-drive-provider'
import { OpenDocumentUseCase } from '../usecases/open-document'
import { UserInteractor } from '../ports/user-interactor'
import { Document, calculateFileMd5 } from '@shared'
import * as crypto from 'crypto'

// Mock exec to prevent real macOS file open triggers during testing
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
    cb(null, '', '')
  })
}))

describe('OpenDocumentUseCase Integration Tests with Prompting', () => {
  let tempDir: string
  let localWorkspaceDir: string
  let driveWorkspaceDir: string

  let dbManager: DatabaseManager
  let docRepo: SQLiteDocumentRepository
  let provider: GoogleDriveProvider
  let useCase: OpenDocumentUseCase
  let mockInteractor: UserInteractor

  beforeEach(() => {
    // Create clean directories for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-usecase-prompt-test-'))
    localWorkspaceDir = path.join(tempDir, 'local')
    driveWorkspaceDir = path.join(tempDir, 'drive')
    fs.mkdirSync(localWorkspaceDir)
    fs.mkdirSync(driveWorkspaceDir)

    // Initialize DB Manager
    dbManager = new DatabaseManager(':memory:')
    dbManager.connect()
    docRepo = new SQLiteDocumentRepository(() => dbManager.getDatabase())

    // Initialize Drive Provider targeting drive workspace
    provider = new GoogleDriveProvider(driveWorkspaceDir)

    // Initialize Mock Interactor
    mockInteractor = {
      promptSingleCandidate: vi.fn().mockResolvedValue('OPEN_DRIVE'),
      promptMultipleCandidates: vi.fn().mockResolvedValue({ action: 'CANCEL' }),
      promptConflict: vi.fn().mockResolvedValue('CANCEL')
    }

    // Initialize Use Case
    useCase = new OpenDocumentUseCase(docRepo, provider, mockInteractor)
  })

  afterEach(() => {
    dbManager.disconnect()
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    vi.clearAllMocks()
  })

  const createDummyDocument = (overrides?: Partial<Document>): Document => ({
    id: crypto.randomUUID(),
    drivePath: `My Drive/file-${crypto.randomUUID()}.txt`,
    localOriginalPath: null,
    driveHash: null,
    localHash: null,
    driveModifiedTime: null,
    localModifiedTime: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastOpened: null,
    status: 'LINKED',
    metadata: {},
    folderMappingId: null,
    ...overrides
  })

  it('should return LOCAL_FILE_NOT_FOUND when local file does not exist', async () => {
    const result = await useCase.execute(path.join(localWorkspaceDir, 'non-existent.txt'))
    expect(result.type).toBe('LOCAL_FILE_NOT_FOUND')
  })

  describe('Database Hit Workflow (R2)', () => {
    it('should open canonical Drive file directly without prompting on DB hit', async () => {
      const localPath = path.join(localWorkspaceDir, 'report.docx')
      const drivePath = 'My Drive/canonical_report.docx'
      const driveAbsPath = path.join(driveWorkspaceDir, drivePath)

      fs.writeFileSync(localPath, 'Local content')
      fs.mkdirSync(path.dirname(driveAbsPath), { recursive: true })
      fs.writeFileSync(driveAbsPath, 'Drive content')

      const doc = createDummyDocument({
        drivePath,
        localOriginalPath: localPath,
        status: 'LINKED'
      })
      await docRepo.create(doc)

      const result = await useCase.execute(localPath)
      expect(result.type).toBe('OPENED')
      expect(mockInteractor.promptSingleCandidate).not.toHaveBeenCalled()

      if (result.type === 'OPENED') {
        expect(result.document.id).toBe(doc.id)
        expect(result.document.lastOpened).not.toBeNull()
      }
    })

    it('should update state to DRIVE_DELETED directly if canonical Drive file is missing', async () => {
      const localPath = path.join(localWorkspaceDir, 'report.docx')
      const drivePath = 'My Drive/deleted_report.docx'

      fs.writeFileSync(localPath, 'Local content')

      const doc = createDummyDocument({
        drivePath,
        localOriginalPath: localPath,
        status: 'LINKED'
      })
      await docRepo.create(doc)

      const result = await useCase.execute(localPath)
      expect(result.type).toBe('OPENED')

      const updated = await docRepo.findById(doc.id)
      expect(updated?.status).toBe('DRIVE_DELETED')
    })

    it('should sync local content to Drive if local file changed but Drive did not', async () => {
      const localPath = path.join(localWorkspaceDir, 'report.docx')
      const drivePath = 'My Drive/canonical_report.docx'
      const driveAbsPath = path.join(driveWorkspaceDir, drivePath)

      fs.writeFileSync(localPath, 'Initial Content')
      fs.mkdirSync(path.dirname(driveAbsPath), { recursive: true })
      fs.writeFileSync(driveAbsPath, 'Initial Content')

      const initialHash = await calculateFileMd5(localPath)
      const doc = createDummyDocument({
        drivePath,
        localOriginalPath: localPath,
        localHash: initialHash,
        driveHash: initialHash,
        status: 'LINKED'
      })
      await docRepo.create(doc)

      // Replace local file with new content
      fs.writeFileSync(localPath, 'New Local Content')

      const result = await useCase.execute(localPath)
      expect(result.type).toBe('OPENED')

      // Drive file should now contain the new local content
      expect(fs.readFileSync(driveAbsPath, 'utf8')).toBe('New Local Content')

      // DB hashes should be updated
      const updated = await docRepo.findById(doc.id)
      expect(updated?.localHash).not.toBe(initialHash)
      expect(updated?.driveHash).not.toBe(initialHash)
      expect(updated?.localHash).toBe(updated?.driveHash)
    })

    it('should sync Drive content to Local if Drive file changed but Local did not', async () => {
      const localPath = path.join(localWorkspaceDir, 'report.docx')
      const drivePath = 'My Drive/canonical_report.docx'
      const driveAbsPath = path.join(driveWorkspaceDir, drivePath)

      fs.writeFileSync(localPath, 'Initial Content')
      fs.mkdirSync(path.dirname(driveAbsPath), { recursive: true })
      fs.writeFileSync(driveAbsPath, 'Initial Content')

      const initialHash = await calculateFileMd5(localPath)
      const doc = createDummyDocument({
        drivePath,
        localOriginalPath: localPath,
        localHash: initialHash,
        driveHash: initialHash,
        status: 'LINKED'
      })
      await docRepo.create(doc)

      // Replace Drive file with new content
      fs.writeFileSync(driveAbsPath, 'New Drive Content')

      const result = await useCase.execute(localPath)
      expect(result.type).toBe('OPENED')

      // Local file should now contain the new Drive content
      expect(fs.readFileSync(localPath, 'utf8')).toBe('New Drive Content')

      // DB hashes should be updated
      const updated = await docRepo.findById(doc.id)
      expect(updated?.localHash).not.toBe(initialHash)
      expect(updated?.driveHash).not.toBe(initialHash)
      expect(updated?.localHash).toBe(updated?.driveHash)
    })
  })

  describe('Database Miss Workflow (R3 / R4)', () => {
    describe('Case 3: No candidates found (R3.3)', () => {
      it('should automatically import file to My Drive/Other', async () => {
        const localPath = path.join(localWorkspaceDir, 'new_sheet.xlsx')
        fs.writeFileSync(localPath, 'Excel data content')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')
        expect(mockInteractor.promptSingleCandidate).not.toHaveBeenCalled()

        if (result.type === 'OPENED') {
          expect(result.document.drivePath).toBe('My Drive/Other/new_sheet.xlsx')
          expect(fs.existsSync(path.join(driveWorkspaceDir, 'My Drive/Other/new_sheet.xlsx'))).toBe(
            true
          )

          // Verify db record created
          const docInDb = await docRepo.findById(result.document.id)
          expect(docInDb).toBeDefined()
          expect(docInDb?.localOriginalPath).toBe(localPath)
          expect(docInDb?.status).toBe('LINKED')
        }
      })
    })

    describe('Case 1: Single candidate found (R3.1)', () => {
      let localPath: string
      let drivePath: string
      let driveAbsPath: string

      beforeEach(() => {
        localPath = path.join(localWorkspaceDir, 'budget.xlsx')
        fs.writeFileSync(localPath, 'Local Budget contents')

        drivePath = 'My Drive/Finance/budget.xlsx'
        driveAbsPath = path.join(driveWorkspaceDir, drivePath)
        fs.mkdirSync(path.dirname(driveAbsPath), { recursive: true })
        fs.writeFileSync(driveAbsPath, 'Drive Budget contents (different content)')
      })

      it('should prompt user and link to Drive copy if user chooses OPEN_DRIVE', async () => {
        vi.mocked(mockInteractor.promptSingleCandidate).mockResolvedValue('OPEN_DRIVE')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')
        expect(mockInteractor.promptSingleCandidate).toHaveBeenCalledWith(
          localPath,
          expect.objectContaining({
            drivePath
          })
        )

        if (result.type === 'OPENED') {
          expect(result.document.drivePath).toBe(drivePath)
          expect(result.document.localOriginalPath).toBe(localPath)

          // Verify record exists in DB
          const saved = await docRepo.findByLocalOriginalPath(localPath)
          expect(saved).toBeDefined()
          expect(saved?.drivePath).toBe(drivePath)
        }
      })

      it('should import as new copy if user chooses IMPORT_NEW', async () => {
        vi.mocked(mockInteractor.promptSingleCandidate).mockResolvedValue('IMPORT_NEW')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')

        if (result.type === 'OPENED') {
          // Imported to My Drive/Other
          expect(result.document.drivePath).toBe('My Drive/Other/budget.xlsx')
          expect(fs.existsSync(path.join(driveWorkspaceDir, 'My Drive/Other/budget.xlsx'))).toBe(
            true
          )
        }
      })

      it('should cancel open action and write nothing if user chooses CANCEL', async () => {
        vi.mocked(mockInteractor.promptSingleCandidate).mockResolvedValue('CANCEL')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('CANCELLED')

        // Verify no link in DB
        const saved = await docRepo.findByLocalOriginalPath(localPath)
        expect(saved).toBeNull()
      })
    })

    describe('Case 2: Multiple candidates found (R3.2)', () => {
      let localPath: string
      let drivePath1: string
      let drivePath2: string

      beforeEach(() => {
        localPath = path.join(localWorkspaceDir, 'notes.txt')
        fs.writeFileSync(localPath, 'Local Notes contents')

        drivePath1 = 'My Drive/NotesA/notes.txt'
        drivePath2 = 'My Drive/NotesB/notes.txt'
        const driveAbs1 = path.join(driveWorkspaceDir, drivePath1)
        const driveAbs2 = path.join(driveWorkspaceDir, drivePath2)

        fs.mkdirSync(path.dirname(driveAbs1), { recursive: true })
        fs.mkdirSync(path.dirname(driveAbs2), { recursive: true })
        fs.writeFileSync(driveAbs1, 'Drive Notes A')
        fs.writeFileSync(driveAbs2, 'Drive Notes B')
      })

      it('should prompt user and link to selected candidate if user chooses OPEN_DRIVE', async () => {
        // Mock picker choosing candidate 2
        vi.mocked(mockInteractor.promptMultipleCandidates).mockImplementation(
          async (_path, candidates) => {
            const selected = candidates.find((c) => c.drivePath === drivePath2)!
            return { action: 'OPEN_DRIVE', selected }
          }
        )

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')
        expect(mockInteractor.promptMultipleCandidates).toHaveBeenCalled()

        if (result.type === 'OPENED') {
          expect(result.document.drivePath).toBe(drivePath2)
          expect(result.document.localOriginalPath).toBe(localPath)

          // Verify db record updated
          const saved = await docRepo.findByLocalOriginalPath(localPath)
          expect(saved).toBeDefined()
          expect(saved?.drivePath).toBe(drivePath2)
        }
      })

      it('should import as new copy if user chooses IMPORT_NEW in multiple match', async () => {
        vi.mocked(mockInteractor.promptMultipleCandidates).mockResolvedValue({
          action: 'IMPORT_NEW'
        })

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')

        if (result.type === 'OPENED') {
          expect(result.document.drivePath).toBe('My Drive/Other/notes.txt')
          expect(fs.existsSync(path.join(driveWorkspaceDir, 'My Drive/Other/notes.txt'))).toBe(true)
        }
      })

      it('should cancel action if user chooses CANCEL in multiple match', async () => {
        vi.mocked(mockInteractor.promptMultipleCandidates).mockResolvedValue({ action: 'CANCEL' })

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('CANCELLED')
      })
    })

    describe('Conflict Resolution Workflow (R9)', () => {
      let localPath: string
      let drivePath: string
      let driveAbs: string
      let doc: Document

      beforeEach(async () => {
        localPath = path.join(localWorkspaceDir, 'conflict.txt')
        drivePath = 'My Drive/conflict.txt'
        driveAbs = path.join(driveWorkspaceDir, drivePath)

        fs.writeFileSync(localPath, 'Initial Local Content')
        fs.mkdirSync(path.dirname(driveAbs), { recursive: true })
        fs.writeFileSync(driveAbs, 'Initial Drive Content')

        // Create a pre-linked conflict document in DB
        doc = createDummyDocument({
          drivePath,
          localOriginalPath: localPath,
          localHash: 'hash-local-old',
          driveHash: 'hash-drive-old',
          status: 'CONFLICT'
        })
        await docRepo.create(doc)
      })

      it('should overwrite local content with Drive content if choice is KEEP_DRIVE', async () => {
        vi.mocked(mockInteractor.promptConflict).mockResolvedValue('KEEP_DRIVE')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')
        expect(fs.readFileSync(localPath, 'utf8')).toBe('Initial Drive Content')

        const saved = await docRepo.findByLocalOriginalPath(localPath)
        expect(saved?.status).toBe('LINKED')
      })

      it('should overwrite Drive content with local content if choice is KEEP_LOCAL', async () => {
        vi.mocked(mockInteractor.promptConflict).mockResolvedValue('KEEP_LOCAL')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')
        expect(fs.readFileSync(driveAbs, 'utf8')).toBe('Initial Local Content')

        const saved = await docRepo.findByLocalOriginalPath(localPath)
        expect(saved?.status).toBe('LINKED')
      })

      it('should rename local file and import it if choice is KEEP_BOTH_RENAME_LOCAL', async () => {
        vi.mocked(mockInteractor.promptConflict).mockResolvedValue('KEEP_BOTH_RENAME_LOCAL')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')

        const renamedLocalPath = path.join(localWorkspaceDir, 'conflict (Local Conflict).txt')
        expect(fs.existsSync(renamedLocalPath)).toBe(true)
        expect(fs.existsSync(localPath)).toBe(false)

        // Renamed local should be linked
        const savedNew = await docRepo.findByLocalOriginalPath(renamedLocalPath)
        expect(savedNew).not.toBeNull()
        expect(savedNew?.drivePath).toBe('My Drive/Other/conflict (Local Conflict).txt')
        expect(savedNew?.status).toBe('LINKED')

        // Original doc should be unlinked
        const savedOld = await docRepo.findByDrivePath(drivePath)
        expect(savedOld?.status).toBe('UNLINKED')
        expect(savedOld?.localOriginalPath).toBeNull()
      })

      it('should rename Drive file and replace original with local if choice is KEEP_BOTH_RENAME_DRIVE', async () => {
        vi.mocked(mockInteractor.promptConflict).mockResolvedValue('KEEP_BOTH_RENAME_DRIVE')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')

        // Renamed Drive file should exist on disk
        const renamedDriveAbs = path.join(
          driveWorkspaceDir,
          'My Drive/conflict (Drive Conflict).txt'
        )
        expect(fs.existsSync(renamedDriveAbs)).toBe(true)
        expect(fs.readFileSync(renamedDriveAbs, 'utf8')).toBe('Initial Drive Content')

        // Original Drive path should now contain local content
        expect(fs.readFileSync(driveAbs, 'utf8')).toBe('Initial Local Content')

        // The renamed Drive file should be in DB as UNLINKED
        const renamedDoc = await docRepo.findByDrivePath('My Drive/conflict (Drive Conflict).txt')
        expect(renamedDoc?.status).toBe('UNLINKED')

        // The original Drive path should be in DB as LINKED to local
        const originalDoc = await docRepo.findByDrivePath(drivePath)
        expect(originalDoc?.status).toBe('LINKED')
        expect(originalDoc?.localOriginalPath).toBe(localPath)
      })

      it('should open Drive version anyway without changes if choice is OPEN_DRIVE_ANYWAY', async () => {
        vi.mocked(mockInteractor.promptConflict).mockResolvedValue('OPEN_DRIVE_ANYWAY')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')

        // Status remains CONFLICT
        const saved = await docRepo.findByLocalOriginalPath(localPath)
        expect(saved?.status).toBe('CONFLICT')
      })

      it('should open Local version anyway without changes if choice is OPEN_LOCAL_ANYWAY', async () => {
        vi.mocked(mockInteractor.promptConflict).mockResolvedValue('OPEN_LOCAL_ANYWAY')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('OPENED')

        // Status remains CONFLICT
        const saved = await docRepo.findByLocalOriginalPath(localPath)
        expect(saved?.status).toBe('CONFLICT')
      })

      it('should return CANCELLED if choice is CANCEL', async () => {
        vi.mocked(mockInteractor.promptConflict).mockResolvedValue('CANCEL')

        const result = await useCase.execute(localPath)
        expect(result.type).toBe('CANCELLED')
      })
    })
  })
})
