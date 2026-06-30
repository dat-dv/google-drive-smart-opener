import * as fs from 'fs';
import * as path from 'path';
import { Document, calculateFileMd5 } from '@shared';
import { DocumentRepository } from '../ports/repositories';
import { CloudProvider } from '../ports/cloud-provider';
import { UserInteractor } from '../ports/user-interactor';

/**
 * Result states for the Open Document workflow.
 */
export type OpenWorkflowResult =
  | { type: 'OPENED'; document: Document }
  | { type: 'CANCELLED' }
  | { type: 'LOCAL_FILE_NOT_FOUND'; localPath: string };

/**
 * Use case to manage the open and import workflow (R1, R2, R3, R4).
 * Intercepts local path requests, resolves existing matches, and prompts user
 * when database misses require candidate linking or new drive imports.
 */
export class OpenDocumentUseCase {
  private readonly docRepo: DocumentRepository;
  private readonly cloudProvider: CloudProvider;
  private readonly interactor: UserInteractor;

  constructor(
    docRepo: DocumentRepository,
    cloudProvider: CloudProvider,
    interactor: UserInteractor
  ) {
    this.docRepo = docRepo;
    this.cloudProvider = cloudProvider;
    this.interactor = interactor;
  }

  /**
   * Orchestrates the lookup and open flow for a given local file path.
   * If database hit: opens the canonical Drive copy and updates lastOpened.
   * If database miss: searches Google Drive recursively and queries user choice.
   */
  public async execute(localPath: string): Promise<OpenWorkflowResult> {
    const resolvedLocalPath = path.resolve(localPath);

    // Guard: Verify target file is physically present locally
    if (!fs.existsSync(resolvedLocalPath)) {
      return { type: 'LOCAL_FILE_NOT_FOUND', localPath: resolvedLocalPath };
    }

    // R2: Query SQLite index by localOriginalPath
    const existingDoc = await this.docRepo.findByLocalOriginalPath(resolvedLocalPath);

    if (existingDoc) {
      // Database Hit: Open the canonical Drive version
      const driveAbsPath = this.cloudProvider.resolveLocalPath(existingDoc.drivePath);
      
      if (!fs.existsSync(driveAbsPath)) {
        // Edge Case: Drive version was deleted outside the app context
        existingDoc.status = 'DRIVE_DELETED';
        await this.docRepo.update(existingDoc);
      } else {
        await this.cloudProvider.openFile(existingDoc.drivePath);
        existingDoc.lastOpened = new Date().toISOString();
        await this.docRepo.update(existingDoc);
      }

      return { type: 'OPENED', document: existingDoc };
    }

    // Database Miss: Initiate R3 recursive search process
    const stats = fs.statSync(resolvedLocalPath);
    const localHash = await calculateFileMd5(resolvedLocalPath);
    const filename = path.basename(resolvedLocalPath);

    // Search Drive candidates by filename
    const driveCandidates = await this.cloudProvider.search({ filename });

    if (driveCandidates.length === 0) {
      // R3.3: No matching files found on Drive -> Auto-import
      const importedDoc = await this.importFile(resolvedLocalPath);
      return { type: 'OPENED', document: importedDoc };
    }

    // Check for exact hash/size match
    const exactMatch = driveCandidates.find(
      (c) => c.driveHash === localHash && c.metadata.size === stats.size
    );

    if (exactMatch) {
      // R3.1: Checksum match -> prompt single candidate
      return this.handleSingleCandidateChoice(resolvedLocalPath, exactMatch);
    }

    if (driveCandidates.length === 1) {
      // R3.1: Exactly 1 candidate found by name -> prompt single candidate
      return this.handleSingleCandidateChoice(resolvedLocalPath, driveCandidates[0]);
    }

    // R3.2: Multiple files found with matching names -> prompt multiple choice
    const choice = await this.interactor.promptMultipleCandidates(resolvedLocalPath, driveCandidates);

    if (choice.action === 'CANCEL') {
      return { type: 'CANCELLED' };
    }

    if (choice.action === 'IMPORT_NEW') {
      const importedDoc = await this.importFile(resolvedLocalPath);
      return { type: 'OPENED', document: importedDoc };
    }

    // choice.action === 'OPEN_DRIVE'
    const linkedDoc = await this.linkToDriveFile(resolvedLocalPath, choice.selected);
    return { type: 'OPENED', document: linkedDoc };
  }

  /**
   * Helper to handle single candidate user choice branch.
   */
  private async handleSingleCandidateChoice(
    localPath: string,
    candidate: Document
  ): Promise<OpenWorkflowResult> {
    const choice = await this.interactor.promptSingleCandidate(localPath, candidate);

    if (choice === 'CANCEL') {
      return { type: 'CANCELLED' };
    }

    if (choice === 'IMPORT_NEW') {
      const importedDoc = await this.importFile(localPath);
      return { type: 'OPENED', document: importedDoc };
    }

    // choice === 'OPEN_DRIVE'
    const linkedDoc = await this.linkToDriveFile(localPath, candidate);
    return { type: 'OPENED', document: linkedDoc };
  }

  /**
   * Helper to copy a local file to Drive mirror and index it.
   */
  private async importFile(localPath: string): Promise<Document> {
    // Import target folder in Google Drive (My Drive/Other) as per R3.3
    const importedDoc = await this.cloudProvider.importFile(localPath, 'My Drive/Other');
    
    // Save to local database
    await this.docRepo.create(importedDoc);
    
    // Open the newly imported file
    await this.cloudProvider.openFile(importedDoc.drivePath);
    
    // Update lastOpened
    importedDoc.lastOpened = new Date().toISOString();
    await this.docRepo.update(importedDoc);

    return importedDoc;
  }

  /**
   * Helper to link a local file to an existing Drive document.
   */
  private async linkToDriveFile(localPath: string, candidate: Document): Promise<Document> {
    candidate.localOriginalPath = localPath;
    candidate.localHash = await calculateFileMd5(localPath);
    candidate.status = 'LINKED';
    candidate.lastOpened = new Date().toISOString();

    const existingInDb = await this.docRepo.findByDrivePath(candidate.drivePath);
    if (existingInDb) {
      candidate.id = existingInDb.id; // Keep original DB ID
      await this.docRepo.update(candidate);
    } else {
      await this.docRepo.create(candidate);
    }

    await this.cloudProvider.openFile(candidate.drivePath);

    return candidate;
  }
}
