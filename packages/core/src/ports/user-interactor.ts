import { Document } from '@shared'

/**
 * Port interface for handling user interactions and choices during database misses.
 * decouples the core domain layer from Electron main-renderer dialogs.
 */
export type ConflictResolutionChoice =
  | 'KEEP_DRIVE'
  | 'KEEP_LOCAL'
  | 'KEEP_BOTH_RENAME_LOCAL'
  | 'KEEP_BOTH_RENAME_DRIVE'
  | 'OPEN_DRIVE_ANYWAY'
  | 'OPEN_LOCAL_ANYWAY'
  | 'CANCEL'

export interface UserInteractor {
  /**
   * Prompts the user when exactly one candidate file is found on Drive.
   * Matches R3.1 requirement.
   */
  promptSingleCandidate(
    localPath: string,
    candidate: Document
  ): Promise<'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL'>

  /**
   * Prompts the user to pick one candidate from a list, or choose to import as new.
   * Matches R3.2 requirement.
   */
  promptMultipleCandidates(
    localPath: string,
    candidates: Document[]
  ): Promise<
    { action: 'OPEN_DRIVE'; selected: Document } | { action: 'IMPORT_NEW' } | { action: 'CANCEL' }
  >

  /**
   * Prompts the user with 6 resolution options when a file conflict is detected (R9).
   */
  promptConflict(localPath: string, document: Document): Promise<ConflictResolutionChoice>
}
