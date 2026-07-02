import { Document } from '@shared'
import { DocumentRepository } from '../../ports/repositories'
import { CloudProvider } from '../../ports/cloud-provider'
import { OpenWorkflowResult } from '../open-document'

/**
 * Enumeration of all possible synchronization state cases
 * when a document index exists in the local SQLite database.
 */
export enum DocumentStateCase {
  /** The Google Drive mirror file no longer physically exists on disk */
  DRIVE_DELETED = 'DRIVE_DELETED',

  /** Both local and Drive files have changed independently and contain conflicting updates */
  CONFLICT_BOTH_CHANGED = 'CONFLICT_BOTH_CHANGED',

  /** Only the local file has changed; Drive mirror contains the old canonical content */
  LOCAL_CHANGED_DRIVE_OLD = 'LOCAL_CHANGED_DRIVE_OLD',

  /** Only the Drive mirror file has changed; local file contains the old content */
  DRIVE_CHANGED_LOCAL_OLD = 'DRIVE_CHANGED_LOCAL_OLD',

  /** Local and Drive mirror files have identical contents, or no modifications occurred */
  LOCAL_AND_DRIVE_IS_SAME = 'LOCAL_AND_DRIVE_IS_SAME'
}

/**
 * Context containing all relevant parameters, repositories, and callbacks
 * required by a DocumentSyncStrategy to evaluate and run synchronization logic.
 */
export interface SyncStrategyContext {
  /** Repository to query and update document index records */
  docRepo: DocumentRepository
  /** Provider facilitating Google Drive operations and file path opening */
  cloudProvider: CloudProvider
  /** Absolute system path of the local file requesting to be opened */
  resolvedLocalPath: string
  /** Absolute system path of the Google Drive local mirror copy */
  driveAbsPath: string
  /** The matching document index row from the SQLite database */
  existingDoc: Document
  /** Freshly computed MD5 checksum of the local file */
  currentLocalHash: string
  /** Freshly computed MD5 checksum of the drive mirror file */
  currentDriveHash: string
  /** The pre-classified synchronization state case */
  stateCase: DocumentStateCase
  /** Callback to trigger interactive conflict resolution workflow when needed */
  resolveConflict: (localPath: string, doc: Document) => Promise<OpenWorkflowResult>
}

/**
 * Strategy interface to decouple different synchronization/conflict scenarios
 * when resolving a document on database hit.
 */
export interface DocumentSyncStrategy {
  /**
   * Evaluates if this strategy is appropriate for the given file state.
   */
  canHandle(context: SyncStrategyContext): Promise<boolean>

  /**
   * Executes the synchronization or conflict flow logic.
   */
  execute(context: SyncStrategyContext): Promise<OpenWorkflowResult | null>
}
