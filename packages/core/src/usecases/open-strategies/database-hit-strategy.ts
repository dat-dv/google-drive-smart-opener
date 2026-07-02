import { Document, calculateFileMd5 } from '@shared'
import { DocumentOpenContext, DocumentOpenStrategy } from './types'
import { OpenWorkflowResult } from '../open-document'
import {
  DocumentSyncStrategy,
  DriveDeletedStrategy,
  ConflictStrategy,
  LocalChangedStrategy,
  DriveChangedStrategy,
  DocumentStateClassifier
} from '../sync-strategies'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

/**
 * Strategy handling when the requested local file already exists in the SQLite database index.
 * Delegates file synchronization details to sub-strategies (DriveDeleted, Conflict, LocalChanged, DriveChanged).
 */
export class DatabaseHitStrategy implements DocumentOpenStrategy {
  private readonly syncStrategies: DocumentSyncStrategy[] = [
    new DriveDeletedStrategy(),
    new ConflictStrategy(),
    new LocalChangedStrategy(),
    new DriveChangedStrategy()
  ]

  public async canHandle(context: DocumentOpenContext): Promise<boolean> {
    const doc = await context.getExistingDoc()
    return doc !== null
  }

  public async execute(context: DocumentOpenContext): Promise<OpenWorkflowResult> {
    const existingDoc = (await context.getExistingDoc())!
    const driveAbsPath = context.cloudProvider.resolveLocalPath(existingDoc.drivePath)

    let currentLocalHash = ''
    let currentDriveHash = ''
    try {
      currentLocalHash = await calculateFileMd5(context.resolvedLocalPath)
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
      docRepo: context.docRepo,
      cloudProvider: context.cloudProvider,
      resolvedLocalPath: context.resolvedLocalPath,
      driveAbsPath,
      existingDoc,
      currentLocalHash,
      currentDriveHash,
      stateCase,
      resolveConflict: (localPath: string, doc: Document) =>
        this.resolveConflict(context, localPath, doc)
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
    await context.cloudProvider.openFile(existingDoc.drivePath, true)
    existingDoc.lastOpened = new Date().toISOString()
    await context.docRepo.update(existingDoc)

    return { type: 'OPENED', document: existingDoc }
  }

  /**
   * Helper to execute 6 strategies of Conflict Resolution (R9).
   */
  private async resolveConflict(
    context: DocumentOpenContext,
    localPath: string,
    doc: Document
  ): Promise<OpenWorkflowResult> {
    const choice = await context.interactor.promptConflict(localPath, doc)

    if (choice === 'CANCEL') {
      return { type: 'CANCELLED' }
    }

    const driveAbsPath = context.cloudProvider.resolveLocalPath(doc.drivePath)
    const now = new Date().toISOString()

    if (choice === 'KEEP_DRIVE') {
      // Overwrite local with Drive content
      fs.copyFileSync(driveAbsPath, localPath)
      const fileHash = await calculateFileMd5(driveAbsPath)

      doc.localHash = fileHash
      doc.driveHash = fileHash
      doc.status = 'LINKED'
      doc.lastOpened = now
      await context.docRepo.update(doc)

      await context.cloudProvider.openFile(doc.drivePath)
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
      await context.docRepo.update(doc)

      await context.cloudProvider.openFile(doc.drivePath)
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
      await context.docRepo.update(doc)

      // Import renamed local file to Drive as a new document
      const importedDoc = await context.cloudProvider.importFile(newLocalPath, 'My Drive/Other')

      // Update link parameters on imported doc
      importedDoc.localOriginalPath = newLocalPath
      importedDoc.localHash = await calculateFileMd5(newLocalPath)
      importedDoc.status = 'LINKED'
      importedDoc.lastOpened = now
      await context.docRepo.create(importedDoc)

      await context.cloudProvider.openFile(importedDoc.drivePath)
      return { type: 'OPENED', document: importedDoc }
    }

    if (choice === 'KEEP_BOTH_RENAME_DRIVE') {
      const originalDrivePath = doc.drivePath
      const ext = path.extname(originalDrivePath)
      const base = path.basename(originalDrivePath, ext)
      const dir = path.dirname(originalDrivePath)
      const newDrivePath = path.join(dir, `${base} (Drive Conflict)${ext}`)

      const newDriveAbsPath = context.cloudProvider.resolveLocalPath(newDrivePath)

      // Rename Drive file in mirror
      fs.renameSync(driveAbsPath, newDriveAbsPath)

      // Update the renamed Drive record to be unlinked
      doc.drivePath = newDrivePath
      doc.localOriginalPath = null
      doc.localHash = null
      doc.status = 'UNLINKED'
      await context.docRepo.update(doc)

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
      await context.docRepo.create(newDoc)

      await context.cloudProvider.openFile(originalDrivePath)
      return { type: 'OPENED', document: newDoc }
    }

    if (choice === 'OPEN_DRIVE_ANYWAY') {
      await context.cloudProvider.openFile(doc.drivePath)
      return { type: 'OPENED', document: doc }
    }

    if (choice === 'OPEN_LOCAL_ANYWAY') {
      await context.cloudProvider.openFile(localPath)
      return { type: 'OPENED', document: doc }
    }

    return { type: 'CANCELLED' }
  }
}
