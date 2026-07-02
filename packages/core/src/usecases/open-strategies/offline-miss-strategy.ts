import { Document, calculateFileMd5, guessMimeType } from '@shared'
import { DocumentOpenContext, DocumentOpenStrategy } from './types'
import { OpenWorkflowResult } from '../open-document'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

/**
 * Strategy handling when the requested file is not in the database, and the application is offline.
 * Creates an index placeholder with status UNLINKED, opens local file natively, and registers an offline sync task.
 */
export class OfflineMissStrategy implements DocumentOpenStrategy {
  public async canHandle(context: DocumentOpenContext): Promise<boolean> {
    const doc = await context.getExistingDoc()
    return !context.isOnline && doc === null
  }

  public async execute(context: DocumentOpenContext): Promise<OpenWorkflowResult> {
    const { resolvedLocalPath, docRepo, cloudProvider, taskRepo } = context
    const stats = fs.statSync(resolvedLocalPath)
    const localHash = await calculateFileMd5(resolvedLocalPath)
    const filename = path.basename(resolvedLocalPath)

    const placeholderDoc: Document = {
      id: crypto.randomUUID(),
      drivePath: `My Drive/Other/${filename}`,
      localOriginalPath: resolvedLocalPath,
      driveHash: null,
      localHash: localHash,
      driveModifiedTime: null,
      localModifiedTime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpened: new Date().toISOString(),
      status: 'UNLINKED',
      metadata: {
        size: stats.size,
        mimeType: guessMimeType(filename),
        provider: 'google-drive',
        offlinePending: true
      },
      folderMappingId: null
    }

    await docRepo.create(placeholderDoc)
    await cloudProvider.openFile(resolvedLocalPath)

    if (taskRepo) {
      await taskRepo.create({
        id: crypto.randomUUID(),
        type: 'IMPORT_FILE',
        payload: JSON.stringify({
          localFilePath: resolvedLocalPath,
          targetDriveFolder: 'My Drive/Other',
          documentId: placeholderDoc.id
        }),
        createdAt: new Date().toISOString(),
        status: 'PENDING'
      })
    }

    return { type: 'OPENED', document: placeholderDoc }
  }
}
