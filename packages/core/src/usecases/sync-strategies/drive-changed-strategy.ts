import * as fs from 'fs'
import { calculateFileMd5 } from '@shared'
import { DocumentSyncStrategy, SyncStrategyContext, DocumentStateCase } from './types'
import { OpenWorkflowResult } from '../open-document'

/**
 * Strategy to handle scenario where only the Google Drive mirror file
 * has been modified, necessitating copying Drive edits back to the local file.
 */
export class DriveChangedStrategy implements DocumentSyncStrategy {
  /**
   * Returns true if the stateCase is DRIVE_CHANGED_LOCAL_OLD.
   */
  public async canHandle(context: SyncStrategyContext): Promise<boolean> {
    return context.stateCase === DocumentStateCase.DRIVE_CHANGED_LOCAL_OLD
  }

  /**
   * Copies the Drive mirror file to the local path, updates DB hashes/metadata,
   * and returns null to allow the main usecase to open the document.
   */
  public async execute(context: SyncStrategyContext): Promise<OpenWorkflowResult | null> {
    const { resolvedLocalPath, driveAbsPath, existingDoc, docRepo } = context

    fs.copyFileSync(driveAbsPath, resolvedLocalPath)
    const newHash = await calculateFileMd5(resolvedLocalPath)

    existingDoc.localHash = newHash
    existingDoc.driveHash = newHash
    existingDoc.localModifiedTime = new Date().toISOString()
    existingDoc.driveModifiedTime = new Date().toISOString()
    if (!existingDoc.metadata) {
      existingDoc.metadata = {}
    }
    existingDoc.metadata.size = fs.statSync(resolvedLocalPath).size

    await docRepo.update(existingDoc)

    // Return null to delegate the actual OS open command to the master executor
    return null
  }
}
