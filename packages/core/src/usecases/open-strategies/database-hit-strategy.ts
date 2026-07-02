import { calculateFileMd5 } from '@shared'
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
      resolveConflict: context.resolveConflict
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
}
