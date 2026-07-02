import { Document } from '@shared'
import { DocumentOpenContext, DocumentOpenStrategy } from './types'
import { OpenWorkflowResult } from '../open-document'

/**
 * Strategy handling when the file is not mapped in SQLite, the app is online, and there are no candidates with the same name on Drive.
 * Automatically copies (imports) the local file into the Drive mirror root (My Drive/Other), indexes it as LINKED, and opens it.
 */
export class NoCandidatesMissStrategy implements DocumentOpenStrategy {
  public async canHandle(context: DocumentOpenContext): Promise<boolean> {
    const doc = await context.getExistingDoc()
    if (!context.isOnline || doc !== null) return false
    const candidates = await context.getDriveCandidates()
    return candidates.length === 0
  }

  public async execute(context: DocumentOpenContext): Promise<OpenWorkflowResult> {
    const importedDoc = await this.importFile(context)
    return { type: 'OPENED', document: importedDoc }
  }

  private async importFile(context: DocumentOpenContext): Promise<Document> {
    // Import target folder in Google Drive (My Drive/Other) as per R3.3
    const importedDoc = await context.cloudProvider.importFile(
      context.resolvedLocalPath,
      'My Drive/Other'
    )

    // Save to local database
    await context.docRepo.create(importedDoc)

    // Open the newly imported file
    await context.cloudProvider.openFile(importedDoc.drivePath, true)

    // Update lastOpened
    importedDoc.lastOpened = new Date().toISOString()
    await context.docRepo.update(importedDoc)

    return importedDoc
  }
}
