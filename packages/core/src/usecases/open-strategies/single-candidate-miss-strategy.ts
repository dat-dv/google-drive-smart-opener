import { Document, calculateFileMd5 } from '@shared'
import { DocumentOpenContext, DocumentOpenStrategy } from './types'
import { OpenWorkflowResult } from '../open-document'
import * as fs from 'fs'

/**
 * Strategy handling when the file is not in SQLite, app is online, and there is exactly one Drive file candidate or an exact checksum+size match.
 * Prompts the user to link to this Drive copy, import as a new file, or cancel.
 */
export class SingleCandidateMissStrategy implements DocumentOpenStrategy {
  public async canHandle(context: DocumentOpenContext): Promise<boolean> {
    const doc = await context.getExistingDoc()
    if (!context.isOnline || doc !== null) return false

    const candidates = await context.getDriveCandidates()
    if (candidates.length === 0) return false

    const stats = fs.statSync(context.resolvedLocalPath)
    const localHash = await calculateFileMd5(context.resolvedLocalPath)

    const exactMatch = candidates.find(
      (c) => c.driveHash === localHash && c.metadata.size === stats.size
    )

    return !!exactMatch || candidates.length === 1
  }

  public async execute(context: DocumentOpenContext): Promise<OpenWorkflowResult> {
    const candidates = await context.getDriveCandidates()
    const stats = fs.statSync(context.resolvedLocalPath)
    const localHash = await calculateFileMd5(context.resolvedLocalPath)

    const exactMatch = candidates.find(
      (c) => c.driveHash === localHash && c.metadata.size === stats.size
    )

    const targetCandidate = exactMatch || candidates[0]
    return this.handleSingleCandidateChoice(context, targetCandidate)
  }

  private async handleSingleCandidateChoice(
    context: DocumentOpenContext,
    candidate: Document
  ): Promise<OpenWorkflowResult> {
    const choice = await context.interactor.promptSingleCandidate(
      context.resolvedLocalPath,
      candidate
    )

    if (choice === 'CANCEL') {
      return { type: 'CANCELLED' }
    }

    if (choice === 'IMPORT_NEW') {
      const importedDoc = await this.importFile(context)
      return { type: 'OPENED', document: importedDoc }
    }

    // choice === 'OPEN_DRIVE'
    const linkedDoc = await this.linkToDriveFile(context, candidate)
    return { type: 'OPENED', document: linkedDoc }
  }

  private async importFile(context: DocumentOpenContext): Promise<Document> {
    const importedDoc = await context.cloudProvider.importFile(
      context.resolvedLocalPath,
      'My Drive/Other'
    )
    await context.docRepo.create(importedDoc)
    await context.cloudProvider.openFile(importedDoc.drivePath, true)
    importedDoc.lastOpened = new Date().toISOString()
    await context.docRepo.update(importedDoc)
    return importedDoc
  }

  private async linkToDriveFile(
    context: DocumentOpenContext,
    candidate: Document
  ): Promise<Document> {
    candidate.localOriginalPath = context.resolvedLocalPath
    candidate.localHash = await calculateFileMd5(context.resolvedLocalPath)
    candidate.status = 'LINKED'
    candidate.lastOpened = new Date().toISOString()

    const existingInDb = await context.docRepo.findByDrivePath(candidate.drivePath)
    if (existingInDb) {
      candidate.id = existingInDb.id // Keep original DB ID
      await context.docRepo.update(candidate)
    } else {
      await context.docRepo.create(candidate)
    }

    await context.cloudProvider.openFile(candidate.drivePath, true)
    return candidate
  }
}
