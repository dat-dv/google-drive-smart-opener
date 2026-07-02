import { DocumentSyncStrategy, SyncStrategyContext, DocumentStateCase } from './types'
import { OpenWorkflowResult } from '../open-document'

/**
 * Strategy to handle scenario where the indexed Google Drive mirror file
 * has been deleted or is missing on the filesystem.
 */
export class DriveDeletedStrategy implements DocumentSyncStrategy {
  /**
   * Returns true if the stateCase is DRIVE_DELETED.
   */
  public async canHandle(context: SyncStrategyContext): Promise<boolean> {
    return context.stateCase === DocumentStateCase.DRIVE_DELETED
  }

  /**
   * Marks the document as DRIVE_DELETED and completes the workflow.
   */
  public async execute(context: SyncStrategyContext): Promise<OpenWorkflowResult | null> {
    const { existingDoc, docRepo } = context
    existingDoc.status = 'DRIVE_DELETED'
    await docRepo.update(existingDoc)
    return { type: 'OPENED', document: existingDoc }
  }
}
