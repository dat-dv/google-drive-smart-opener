import * as fs from 'fs'
import { Document } from '@shared'
import { DocumentStateCase } from './types'

/**
 * Classifies the synchronization relationship between a local file,
 * its drive mirror copy, and the database record.
 */
export class DocumentStateClassifier {
  /**
   * Evaluates file presence and MD5 hashes to identify the precise DocumentStateCase.
   */
  public static classify(
    existingDoc: Document,
    driveAbsPath: string,
    currentLocalHash: string,
    currentDriveHash: string
  ): DocumentStateCase {
    // Case 1: Drive file missing on disk
    if (!fs.existsSync(driveAbsPath)) {
      return DocumentStateCase.DRIVE_DELETED
    }

    // Pre-existing conflict flagged by DB/watcher
    if (existingDoc.status === 'CONFLICT') {
      return DocumentStateCase.CONFLICT_BOTH_CHANGED
    }

    const dbLocalHash = existingDoc.localHash
    const dbDriveHash = existingDoc.driveHash

    // If database hashes are uninitialized, default to LOCAL_AND_DRIVE_IS_SAME
    if (!dbLocalHash || !dbDriveHash) {
      return DocumentStateCase.LOCAL_AND_DRIVE_IS_SAME
    }

    const localChanged = currentLocalHash !== dbLocalHash
    const driveChanged = currentDriveHash !== dbDriveHash

    // Case 2: Both files have modified hashes relative to DB
    if (localChanged && driveChanged) {
      // If both were edited to the exact same content, they are already synced
      if (currentLocalHash === currentDriveHash) {
        return DocumentStateCase.LOCAL_AND_DRIVE_IS_SAME
      }
      return DocumentStateCase.CONFLICT_BOTH_CHANGED
    }

    // Case 3: Only local file has changed
    if (localChanged && !driveChanged) {
      return DocumentStateCase.LOCAL_CHANGED_DRIVE_OLD
    }

    // Case 4: Only drive file has changed
    if (!localChanged && driveChanged) {
      return DocumentStateCase.DRIVE_CHANGED_LOCAL_OLD
    }

    // Case 5: Neither has changed relative to DB
    return DocumentStateCase.LOCAL_AND_DRIVE_IS_SAME
  }
}
