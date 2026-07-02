import * as fs from 'fs'
import { calculateFileMd5 } from '@shared'
import { DocumentSyncStrategy, SyncStrategyContext, DocumentStateCase } from './types'
import { OpenWorkflowResult } from '../open-document'

/**
 * Strategy to handle scenario where only the local file has been modified
 * relative to the database index, necessitating copying local changes to Google Drive.
 */
export class LocalChangedStrategy implements DocumentSyncStrategy {
  /**
   * Returns true if the stateCase is LOCAL_CHANGED_DRIVE_OLD.
   */
  public async canHandle(context: SyncStrategyContext): Promise<boolean> {
    return context.stateCase === DocumentStateCase.LOCAL_CHANGED_DRIVE_OLD
  }

  /**
   * Copies the local file to the Drive mirror, updates DB hashes/metadata,
   * and returns null to allow the main usecase to open the document.
   */
  public async execute(context: SyncStrategyContext): Promise<OpenWorkflowResult | null> {
    const { resolvedLocalPath, driveAbsPath, existingDoc, docRepo } = context

    fs.copyFileSync(resolvedLocalPath, driveAbsPath)
    const newHash = await calculateFileMd5(driveAbsPath)

    existingDoc.localHash = newHash
    existingDoc.driveHash = newHash
    existingDoc.localModifiedTime = new Date().toISOString()
    existingDoc.driveModifiedTime = new Date().toISOString()
    if (!existingDoc.metadata) {
      existingDoc.metadata = {}
    }
    existingDoc.metadata.size = fs.statSync(driveAbsPath).size

    await docRepo.update(existingDoc)

    // Return null to delegate the actual OS open command to the master executor
    return null
  }
}
