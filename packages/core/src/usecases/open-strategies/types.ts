import { Document } from '@shared'
import { DocumentRepository, OfflineTaskRepository } from '../../ports/repositories'
import { CloudProvider } from '../../ports/cloud-provider'
import { UserInteractor } from '../../ports/user-interactor'
import { OpenWorkflowResult } from '../open-document'
import * as path from 'path'

/**
 * Context containing all repositories, providers, and state resolvers
 * required by the DocumentOpenStrategy pipeline.
 * Utilizes caching/memoization to avoid redundant database or network requests.
 */
export class DocumentOpenContext {
  public readonly docRepo: DocumentRepository
  public readonly cloudProvider: CloudProvider
  public readonly interactor: UserInteractor
  public readonly taskRepo?: OfflineTaskRepository
  public readonly resolvedLocalPath: string
  public readonly isOnline: boolean

  private _existingDoc: Document | null | undefined = undefined
  private _driveCandidates: Document[] | undefined = undefined

  constructor(
    docRepo: DocumentRepository,
    cloudProvider: CloudProvider,
    interactor: UserInteractor,
    resolvedLocalPath: string,
    isOnline: boolean,
    taskRepo?: OfflineTaskRepository
  ) {
    this.docRepo = docRepo
    this.cloudProvider = cloudProvider
    this.interactor = interactor
    this.resolvedLocalPath = resolvedLocalPath
    this.isOnline = isOnline
    this.taskRepo = taskRepo
  }

  /**
   * Fetches the mapped document from local SQLite database (cached).
   */
  public async getExistingDoc(): Promise<Document | null> {
    if (this._existingDoc === undefined) {
      this._existingDoc = await this.docRepo.findByLocalOriginalPath(this.resolvedLocalPath)
    }
    return this._existingDoc
  }

  /**
   * Fetches matching candidate documents from Google Drive (cached).
   */
  public async getDriveCandidates(): Promise<Document[]> {
    if (this._driveCandidates === undefined) {
      const filename = path.basename(this.resolvedLocalPath)
      this._driveCandidates = await this.cloudProvider.search({ filename })
    }
    return this._driveCandidates
  }
}

/**
 * Strategy interface to handle a specific branch of the open-document workflow decision tree.
 */
export interface DocumentOpenStrategy {
  /**
   * Evaluates if this strategy can handle the given workflow context.
   */
  canHandle(context: DocumentOpenContext): Promise<boolean>

  /**
   * Executes the strategy logic and returns the final workflow outcome.
   */
  execute(context: DocumentOpenContext): Promise<OpenWorkflowResult>
}
