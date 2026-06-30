import * as fs from 'fs';
import * as path from 'path';
import { Document, calculateFileMd5 } from '@shared';
import { DocumentRepository } from '../ports/repositories';
import { CloudProvider } from '../ports/cloud-provider';

/**
 * Result states for the Open Document workflow.
 * Encapsulates hit/miss conditions to allow the presentation layer (Electron Main)
 * to decide whether to open directly or prompt user with dialogs.
 */
export type OpenWorkflowResult =
  | { type: 'OPENED'; document: Document }
  | { type: 'MISS_SINGLE_CANDIDATE'; localPath: string; candidate: Document }
  | { type: 'MISS_MULTIPLE_CANDIDATES'; localPath: string; candidates: Document[] }
  | { type: 'MISS_NO_CANDIDATES'; localPath: string }
  | { type: 'LOCAL_FILE_NOT_FOUND'; localPath: string };

/**
 * Use case to manage the open workflow (R1, R2, R3).
 * Intercepts local path requests and matches them against database or Google Drive candidates.
 */
export class OpenDocumentUseCase {
  private readonly docRepo: DocumentRepository;
  private readonly cloudProvider: CloudProvider;

  constructor(docRepo: DocumentRepository, cloudProvider: CloudProvider) {
    this.docRepo = docRepo;
    this.cloudProvider = cloudProvider;
  }

  /**
   * Orchestrates the lookup and open flow for a given local file path.
   * If database hit: opens the canonical Drive copy and updates lastOpened.
   * If database miss: searches Google Drive recursively to identify potential candidates.
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
      // R3.3: No matching files found on Drive
      return { type: 'MISS_NO_CANDIDATES', localPath: resolvedLocalPath };
    }

    // If we have candidates, check for an exact hash/size match first
    const exactMatch = driveCandidates.find(
      (c) => c.driveHash === localHash && c.metadata.size === stats.size
    );

    if (exactMatch) {
      // R3.1: High confidence match found by checksum
      return { type: 'MISS_SINGLE_CANDIDATE', localPath: resolvedLocalPath, candidate: exactMatch };
    }

    if (driveCandidates.length === 1) {
      // R3.1: Exactly 1 candidate found by name (but content differs)
      return { type: 'MISS_SINGLE_CANDIDATE', localPath: resolvedLocalPath, candidate: driveCandidates[0] };
    }

    // R3.2: Multiple files found with matching names
    return { type: 'MISS_MULTIPLE_CANDIDATES', localPath: resolvedLocalPath, candidates: driveCandidates };
  }
}
