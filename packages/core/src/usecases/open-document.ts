import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { Document, calculateFileMd5, guessMimeType } from '@shared'
import { DocumentRepository, OfflineTaskRepository } from '../ports/repositories'
import { CloudProvider } from '../ports/cloud-provider'
import { UserInteractor } from '../ports/user-interactor'
import {
  DocumentSyncStrategy,
  DriveDeletedStrategy,
  ConflictStrategy,
  LocalChangedStrategy,
  DriveChangedStrategy,
  DocumentStateClassifier
} from './sync-strategies'

/**
 * Result states for the Open Document workflow.
 */
export type OpenWorkflowResult =
  | { type: 'OPENED'; document: Document }
  | { type: 'CANCELLED' }
  | { type: 'LOCAL_FILE_NOT_FOUND'; localPath: string }

/**
 * Use case to manage the open and import workflow (R1, R2, R3, R4, R9).
 * Intercepts local path requests, resolves existing matches, prompts user
 * when database misses require candidate linking, and manages conflict resolution.
 */
export class OpenDocumentUseCase {
  private readonly docRepo: DocumentRepository
  private readonly cloudProvider: CloudProvider
  private readonly interactor: UserInteractor
  private readonly taskRepo?: OfflineTaskRepository
  private isOnline = true

  private readonly syncStrategies: DocumentSyncStrategy[] = [
    new DriveDeletedStrategy(),
    new ConflictStrategy(),
    new LocalChangedStrategy(),
    new DriveChangedStrategy()
  ]

  constructor(
    docRepo: DocumentRepository,
    cloudProvider: CloudProvider,
    interactor: UserInteractor,
    taskRepo?: OfflineTaskRepository
  ) {
    this.docRepo = docRepo
    this.cloudProvider = cloudProvider
    this.interactor = interactor
    this.taskRepo = taskRepo
  }

  /**
   * Sets the online status dynamically.
   */
  public setOnlineStatus(online: boolean): void {
    this.isOnline = online
  }

  /**
   * Orchestrates the lookup and open flow for a given local file path.
   * If database hit: opens the canonical Drive copy and updates lastOpened.
   * If database miss: searches Google Drive recursively and queries user choice.
   */
  public async execute(localPath: string): Promise<OpenWorkflowResult> {
    const resolvedLocalPath = path.resolve(localPath)

    // Guard: Verify target file is physically present locally
    if (!fs.existsSync(resolvedLocalPath)) {
      return { type: 'LOCAL_FILE_NOT_FOUND', localPath: resolvedLocalPath }
    }

    // R2: Query SQLite index by localOriginalPath
    const existingDoc = await this.docRepo.findByLocalOriginalPath(resolvedLocalPath)

    if (existingDoc) {
      // Database Hit: Open the canonical Drive version
      const driveAbsPath = this.cloudProvider.resolveLocalPath(existingDoc.drivePath)

      let currentLocalHash = ''
      let currentDriveHash = ''
      try {
        currentLocalHash = await calculateFileMd5(resolvedLocalPath)
      } catch {
        // Safe fallback in case file is read-locked or missing
      }
      try {
        currentDriveHash = await calculateFileMd5(driveAbsPath)
      } catch {
        // Safe fallback in case file is read-locked or missing
      }

      const stateCase = DocumentStateClassifier.classify(
        existingDoc,
        driveAbsPath,
        currentLocalHash,
        currentDriveHash
      )

      const syncContext = {
        docRepo: this.docRepo,
        cloudProvider: this.cloudProvider,
        resolvedLocalPath,
        driveAbsPath,
        existingDoc,
        currentLocalHash,
        currentDriveHash,
        stateCase,
        resolveConflict: this.resolveConflict.bind(this)
      }

      for (const strategy of this.syncStrategies) {
        if (await strategy.canHandle(syncContext)) {
          const result = await strategy.execute(syncContext)
          if (result) {
            return result
          }
        }
      }

      // Normal Hit — open via Google Drive desktop app
      await this.cloudProvider.openFile(existingDoc.drivePath, true)
      existingDoc.lastOpened = new Date().toISOString()
      await this.docRepo.update(existingDoc)

      return { type: 'OPENED', document: existingDoc }
    }

    // Database Miss: Initiate R3 recursive search process
    const stats = fs.statSync(resolvedLocalPath)
    const localHash = await calculateFileMd5(resolvedLocalPath)
    const filename = path.basename(resolvedLocalPath)

    // Offline Handling for Database Misses
    if (!this.isOnline) {
      const placeholderDoc: Document = {
        id: crypto.randomUUID(),
        drivePath: `My Drive/Other/${filename}`,
        localOriginalPath: resolvedLocalPath,
        driveHash: null,
        localHash: localHash,
        driveModifiedTime: null,
        localModifiedTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOpened: new Date().toISOString(),
        status: 'UNLINKED',
        metadata: {
          size: stats.size,
          mimeType: guessMimeType(filename),
          provider: 'google-drive',
          offlinePending: true
        },
        folderMappingId: null
      }

      await this.docRepo.create(placeholderDoc)
      await this.cloudProvider.openFile(resolvedLocalPath)

      if (this.taskRepo) {
        await this.taskRepo.create({
          id: crypto.randomUUID(),
          type: 'IMPORT_FILE',
          payload: JSON.stringify({
            localFilePath: resolvedLocalPath,
            targetDriveFolder: 'My Drive/Other',
            documentId: placeholderDoc.id
          }),
          createdAt: new Date().toISOString(),
          status: 'PENDING'
        })
      }

      return { type: 'OPENED', document: placeholderDoc }
    }

    // Search Drive candidates by filename
    const driveCandidates = await this.cloudProvider.search({ filename })

    if (driveCandidates.length === 0) {
      // R3.3: No matching files found on Drive -> Auto-import
      const importedDoc = await this.importFile(resolvedLocalPath)
      return { type: 'OPENED', document: importedDoc }
    }

    // Check for exact hash/size match
    const exactMatch = driveCandidates.find(
      (c) => c.driveHash === localHash && c.metadata.size === stats.size
    )

    if (exactMatch) {
      // R3.1: Checksum match -> prompt single candidate
      return this.handleSingleCandidateChoice(resolvedLocalPath, exactMatch)
    }

    if (driveCandidates.length === 1) {
      // R3.1: Exactly 1 candidate found by name -> prompt single candidate
      return this.handleSingleCandidateChoice(resolvedLocalPath, driveCandidates[0])
    }

    // R3.2: Multiple files found with matching names -> prompt multiple choice
    const choice = await this.interactor.promptMultipleCandidates(
      resolvedLocalPath,
      driveCandidates
    )

    if (choice.action === 'CANCEL') {
      return { type: 'CANCELLED' }
    }

    if (choice.action === 'IMPORT_NEW') {
      const importedDoc = await this.importFile(resolvedLocalPath)
      return { type: 'OPENED', document: importedDoc }
    }

    // choice.action === 'OPEN_DRIVE'
    const linkedDoc = await this.linkToDriveFile(resolvedLocalPath, choice.selected)
    return { type: 'OPENED', document: linkedDoc }
  }

  /**
   * Helper to execute 6 strategies of Conflict Resolution (R9).
   */
  public async resolveConflict(localPath: string, doc: Document): Promise<OpenWorkflowResult> {
    const choice = await this.interactor.promptConflict(localPath, doc)

    if (choice === 'CANCEL') {
      return { type: 'CANCELLED' }
    }

    const driveAbsPath = this.cloudProvider.resolveLocalPath(doc.drivePath)
    const now = new Date().toISOString()

    if (choice === 'KEEP_DRIVE') {
      // Overwrite local with Drive content
      fs.copyFileSync(driveAbsPath, localPath)
      const fileHash = await calculateFileMd5(driveAbsPath)

      doc.localHash = fileHash
      doc.driveHash = fileHash
      doc.status = 'LINKED'
      doc.lastOpened = now
      await this.docRepo.update(doc)

      await this.cloudProvider.openFile(doc.drivePath)
      return { type: 'OPENED', document: doc }
    }

    if (choice === 'KEEP_LOCAL') {
      // Overwrite Drive with local content
      fs.copyFileSync(localPath, driveAbsPath)
      const fileHash = await calculateFileMd5(localPath)

      doc.localHash = fileHash
      doc.driveHash = fileHash
      doc.status = 'LINKED'
      doc.lastOpened = now
      await this.docRepo.update(doc)

      await this.cloudProvider.openFile(doc.drivePath)
      return { type: 'OPENED', document: doc }
    }

    if (choice === 'KEEP_BOTH_RENAME_LOCAL') {
      const ext = path.extname(localPath)
      const base = path.basename(localPath, ext)
      const dir = path.dirname(localPath)
      const newLocalPath = path.join(dir, `${base} (Local Conflict)${ext}`)

      // Rename local file on disk
      fs.renameSync(localPath, newLocalPath)

      // Unlink original doc
      doc.localOriginalPath = null
      doc.localHash = null
      doc.status = 'UNLINKED'
      await this.docRepo.update(doc)

      // Import renamed local file to Drive as a new document
      const importedDoc = await this.cloudProvider.importFile(newLocalPath, 'My Drive/Other')

      // Update link parameters on imported doc
      importedDoc.localOriginalPath = newLocalPath
      importedDoc.localHash = await calculateFileMd5(newLocalPath)
      importedDoc.status = 'LINKED'
      importedDoc.lastOpened = now
      await this.docRepo.create(importedDoc)

      await this.cloudProvider.openFile(importedDoc.drivePath)
      return { type: 'OPENED', document: importedDoc }
    }

    if (choice === 'KEEP_BOTH_RENAME_DRIVE') {
      const originalDrivePath = doc.drivePath
      const ext = path.extname(originalDrivePath)
      const base = path.basename(originalDrivePath, ext)
      const dir = path.dirname(originalDrivePath)
      const newDrivePath = path.join(dir, `${base} (Drive Conflict)${ext}`)

      const newDriveAbsPath = this.cloudProvider.resolveLocalPath(newDrivePath)

      // Rename Drive file in mirror
      fs.renameSync(driveAbsPath, newDriveAbsPath)

      // Update the renamed Drive record to be unlinked
      doc.drivePath = newDrivePath
      doc.localOriginalPath = null
      doc.localHash = null
      doc.status = 'UNLINKED'
      await this.docRepo.update(doc)

      // Copy local file to the original Drive path
      fs.copyFileSync(localPath, driveAbsPath)

      // Create new record for the original Drive path linked to local
      const localHash = await calculateFileMd5(localPath)
      const newDoc: Document = {
        id: crypto.randomUUID(),
        drivePath: originalDrivePath,
        localOriginalPath: localPath,
        driveHash: localHash,
        localHash: localHash,
        driveModifiedTime: now,
        localModifiedTime: now,
        createdAt: now,
        updatedAt: now,
        lastOpened: now,
        status: 'LINKED',
        metadata: {
          size: fs.statSync(driveAbsPath).size,
          provider: 'google-drive'
        },
        folderMappingId: doc.folderMappingId
      }
      await this.docRepo.create(newDoc)

      await this.cloudProvider.openFile(originalDrivePath)
      return { type: 'OPENED', document: newDoc }
    }

    if (choice === 'OPEN_DRIVE_ANYWAY') {
      await this.cloudProvider.openFile(doc.drivePath)
      return { type: 'OPENED', document: doc }
    }

    if (choice === 'OPEN_LOCAL_ANYWAY') {
      await this.cloudProvider.openFile(localPath)
      return { type: 'OPENED', document: doc }
    }

    return { type: 'CANCELLED' }
  }

  /**
   * Helper to handle single candidate user choice branch.
   */
  private async handleSingleCandidateChoice(
    localPath: string,
    candidate: Document
  ): Promise<OpenWorkflowResult> {
    const choice = await this.interactor.promptSingleCandidate(localPath, candidate)

    if (choice === 'CANCEL') {
      return { type: 'CANCELLED' }
    }

    if (choice === 'IMPORT_NEW') {
      const importedDoc = await this.importFile(localPath)
      return { type: 'OPENED', document: importedDoc }
    }

    // choice === 'OPEN_DRIVE'
    const linkedDoc = await this.linkToDriveFile(localPath, candidate)
    return { type: 'OPENED', document: linkedDoc }
  }

  /**
   * Helper to copy a local file to Drive mirror and index it.
   */
  private async importFile(localPath: string): Promise<Document> {
    // Import target folder in Google Drive (My Drive/Other) as per R3.3
    const importedDoc = await this.cloudProvider.importFile(localPath, 'My Drive/Other')

    // Save to local database
    await this.docRepo.create(importedDoc)

    // Open the newly imported file
    await this.cloudProvider.openFile(importedDoc.drivePath, true)

    // Update lastOpened
    importedDoc.lastOpened = new Date().toISOString()
    await this.docRepo.update(importedDoc)

    return importedDoc
  }

  /**
   * Helper to link a local file to an existing Drive document.
   */
  private async linkToDriveFile(localPath: string, candidate: Document): Promise<Document> {
    candidate.localOriginalPath = localPath
    candidate.localHash = await calculateFileMd5(localPath)
    candidate.status = 'LINKED'
    candidate.lastOpened = new Date().toISOString()

    const existingInDb = await this.docRepo.findByDrivePath(candidate.drivePath)
    if (existingInDb) {
      candidate.id = existingInDb.id // Keep original DB ID
      await this.docRepo.update(candidate)
    } else {
      await this.docRepo.create(candidate)
    }

    await this.cloudProvider.openFile(candidate.drivePath, true)

    return candidate
  }
}
