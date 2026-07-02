import { DocumentSyncStrategy, SyncStrategyContext, DocumentStateCase } from './types'
import { OpenWorkflowResult } from '../open-document'

/**
 * Strategy to detect and handle modification conflicts when both local
 * and Drive mirror files have changed independently relative to the DB index.
 */
export class ConflictStrategy implements DocumentSyncStrategy {
  /**
   * Returns true if the stateCase is CONFLICT_BOTH_CHANGED.
   */
  public async canHandle(context: SyncStrategyContext): Promise<boolean> {
    return context.stateCase === DocumentStateCase.CONFLICT_BOTH_CHANGED
  }

  /**
   * Updates status to CONFLICT if needed, and runs the interactive resolver prompt.
   */
  public async execute(context: SyncStrategyContext): Promise<OpenWorkflowResult | null> {
    const { existingDoc, docRepo, resolvedLocalPath, resolveConflict } = context

    if (existingDoc.status !== 'CONFLICT') {
      existingDoc.status = 'CONFLICT'
      await docRepo.update(existingDoc)
    }

    return resolveConflict(resolvedLocalPath, existingDoc)
  }
}
