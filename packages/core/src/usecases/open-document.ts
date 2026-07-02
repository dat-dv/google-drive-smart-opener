import * as fs from 'fs'
import * as path from 'path'
import { Document } from '@shared'
import { DocumentRepository, OfflineTaskRepository } from '../ports/repositories'
import { CloudProvider } from '../ports/cloud-provider'
import { UserInteractor } from '../ports/user-interactor'
import {
  DocumentOpenContext,
  DocumentOpenStrategy,
  DatabaseHitStrategy,
  OfflineMissStrategy,
  NoCandidatesMissStrategy,
  SingleCandidateMissStrategy,
  MultipleCandidatesMissStrategy
} from './open-strategies'

/**
 * Result states for the Open Document workflow.
 */
export type OpenWorkflowResult =
  | { type: 'OPENED'; document: Document }
  | { type: 'CANCELLED' }
  | { type: 'LOCAL_FILE_NOT_FOUND'; localPath: string }

/**
 * Use case to manage the open and import workflow (R1, R2, R3, R4, R9).
 * Intercepts local path requests, resolves existing matches, prompts user
 * when database misses require candidate linking, and manages conflict resolution.
 *
 * Implements a hierarchical Strategy Pattern to handle all branches of the decision tree.
 */
export class OpenDocumentUseCase {
  private readonly docRepo: DocumentRepository
  private readonly cloudProvider: CloudProvider
  private readonly interactor: UserInteractor
  private readonly taskRepo?: OfflineTaskRepository
  private isOnline = true

  private readonly openStrategies: DocumentOpenStrategy[] = [
    new DatabaseHitStrategy(),
    new OfflineMissStrategy(),
    new NoCandidatesMissStrategy(),
    new SingleCandidateMissStrategy(),
    new MultipleCandidatesMissStrategy()
  ]

  constructor(
    docRepo: DocumentRepository,
    cloudProvider: CloudProvider,
    interactor: UserInteractor,
    taskRepo?: OfflineTaskRepository
  ) {
    this.docRepo = docRepo
    this.cloudProvider = cloudProvider
    this.interactor = interactor
    this.taskRepo = taskRepo
  }

  /**
   * Sets the online status dynamically.
   */
  public setOnlineStatus(online: boolean): void {
    this.isOnline = online
  }

  /**
   * Orchestrates the lookup and open flow for a given local file path.
   * Leverages the DocumentOpenStrategy pipeline.
   */
  public async execute(localPath: string): Promise<OpenWorkflowResult> {
    const resolvedLocalPath = path.resolve(localPath)

    // Guard: Verify target file is physically present locally
    if (!fs.existsSync(resolvedLocalPath)) {
      return { type: 'LOCAL_FILE_NOT_FOUND', localPath: resolvedLocalPath }
    }

    const context = new DocumentOpenContext(
      this.docRepo,
      this.cloudProvider,
      this.interactor,
      resolvedLocalPath,
      this.isOnline,
      this.taskRepo
    )

    for (const strategy of this.openStrategies) {
      if (await strategy.canHandle(context)) {
        return await strategy.execute(context)
      }
    }

    throw new Error(`No open strategy could handle path: ${resolvedLocalPath}`)
  }
}
