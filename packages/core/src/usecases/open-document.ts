import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { Document, calculateFileMd5 } from '@shared'
import { DocumentRepository, OfflineTaskRepository } from '../ports/repositories'
import { CloudProvider } from '../ports/cloud-provider'
import { UserInteractor } from '../ports/user-interactor'
import {
  DocumentOpenContext,
  DocumentOpenStrategy,
  DatabaseHitStrategy,
  OfflineMissStrategy,
  NoCandidatesMissStrategy,
  SingleCandidateMissStrategy,
  MultipleCandidatesMissStrategy
} from './open-strategies'

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
 *
 * Implements a hierarchical Strategy Pattern to handle all branches of the decision tree.
 */
export class OpenDocumentUseCase {
  private readonly docRepo: DocumentRepository
  private readonly cloudProvider: CloudProvider
  private readonly interactor: UserInteractor
  private readonly taskRepo?: OfflineTaskRepository
  private isOnline = true

  private readonly openStrategies: DocumentOpenStrategy[] = [
    new DatabaseHitStrategy(),
    new OfflineMissStrategy(),
    new NoCandidatesMissStrategy(),
    new SingleCandidateMissStrategy(),
    new MultipleCandidatesMissStrategy()
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
   * Leverages the DocumentOpenStrategy pipeline.
   */
  public async execute(localPath: string): Promise<OpenWorkflowResult> {
    const resolvedLocalPath = path.resolve(localPath)

    // Guard: Verify target file is physically present locally
    if (!fs.existsSync(resolvedLocalPath)) {
      return { type: 'LOCAL_FILE_NOT_FOUND', localPath: resolvedLocalPath }
    }

    const context = new DocumentOpenContext(
      this.docRepo,
      this.cloudProvider,
      this.interactor,
      resolvedLocalPath,
      this.isOnline,
      this.resolveConflict.bind(this),
      this.taskRepo
    )

    for (const strategy of this.openStrategies) {
      if (await strategy.canHandle(context)) {
        return await strategy.execute(context)
      }
    }

    throw new Error(`No open strategy could handle path: ${resolvedLocalPath}`)
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
}
