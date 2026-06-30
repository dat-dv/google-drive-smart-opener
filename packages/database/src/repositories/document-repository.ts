import DatabaseConnection from 'better-sqlite3'
import { DocumentRepository } from '@core/ports/repositories'
import { Document, DocumentStatus, DocumentMetadata } from '@shared/types'

/**
 * SQLite implementation of DocumentRepository using better-sqlite3.
 */
export class SQLiteDocumentRepository implements DocumentRepository {
  private readonly getDb: () => DatabaseConnection.Database

  /**
   * Constructs the repository with a database client getter.
   */
  constructor(getDb: () => DatabaseConnection.Database) {
    this.getDb = getDb
  }

  /**
   * Maps a raw database row into the domain Document entity.
   * Handles JSON parsing for metadata columns.
   */
  private mapRow(row: unknown): Document {
    const r = row as {
      id: string
      drivePath: string
      localOriginalPath: string | null
      driveHash: string | null
      localHash: string | null
      driveModifiedTime: string | null
      localModifiedTime: string | null
      createdAt: string
      updatedAt: string
      lastOpened: string | null
      status: string
      metadata: string
      folderMappingId: string | null
    }

    let parsedMetadata: DocumentMetadata = {}
    try {
      parsedMetadata = JSON.parse(r.metadata) as DocumentMetadata
    } catch {
      // Graceful fallback if JSON is corrupt, preventing application crash
      parsedMetadata = {}
    }

    return {
      id: r.id,
      drivePath: r.drivePath,
      localOriginalPath: r.localOriginalPath,
      driveHash: r.driveHash,
      localHash: r.localHash,
      driveModifiedTime: r.driveModifiedTime,
      localModifiedTime: r.localModifiedTime,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastOpened: r.lastOpened,
      status: r.status as DocumentStatus,
      metadata: parsedMetadata,
      folderMappingId: r.folderMappingId
    }
  }

  public async findById(id: string): Promise<Document | null> {
    const db = this.getDb()
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id)
    return row ? this.mapRow(row) : null
  }

  public async findByDrivePath(drivePath: string): Promise<Document | null> {
    const db = this.getDb()
    const row = db.prepare('SELECT * FROM documents WHERE drivePath = ?').get(drivePath)
    return row ? this.mapRow(row) : null
  }

  public async findByLocalOriginalPath(localOriginalPath: string): Promise<Document | null> {
    const db = this.getDb()
    const row = db
      .prepare('SELECT * FROM documents WHERE localOriginalPath = ?')
      .get(localOriginalPath)
    return row ? this.mapRow(row) : null
  }

  public async findByDriveHash(driveHash: string): Promise<Document[]> {
    const db = this.getDb()
    const rows = db.prepare('SELECT * FROM documents WHERE driveHash = ?').all(driveHash)
    return rows.map((row) => this.mapRow(row))
  }

  public async create(document: Document): Promise<void> {
    const db = this.getDb()
    db.prepare(
      `
      INSERT INTO documents (
        id, drivePath, localOriginalPath, driveHash, localHash,
        driveModifiedTime, localModifiedTime, createdAt, updatedAt,
        lastOpened, status, metadata, folderMappingId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      document.id,
      document.drivePath,
      document.localOriginalPath,
      document.driveHash,
      document.localHash,
      document.driveModifiedTime,
      document.localModifiedTime,
      document.createdAt,
      document.updatedAt,
      document.lastOpened,
      document.status,
      JSON.stringify(document.metadata || {}),
      document.folderMappingId
    )
  }

  public async update(document: Document): Promise<void> {
    const db = this.getDb()
    const result = db
      .prepare(
        `
      UPDATE documents
      SET drivePath = ?, localOriginalPath = ?, driveHash = ?, localHash = ?,
          driveModifiedTime = ?, localModifiedTime = ?, updatedAt = ?,
          lastOpened = ?, status = ?, metadata = ?, folderMappingId = ?
      WHERE id = ?
    `
      )
      .run(
        document.drivePath,
        document.localOriginalPath,
        document.driveHash,
        document.localHash,
        document.driveModifiedTime,
        document.localModifiedTime,
        document.updatedAt,
        document.lastOpened,
        document.status,
        JSON.stringify(document.metadata || {}),
        document.folderMappingId,
        document.id
      )

    if (result.changes === 0) {
      throw new Error(`Document with ID ${document.id} not found for update`)
    }
  }

  public async delete(id: string): Promise<void> {
    const db = this.getDb()
    db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  }

  public async list(): Promise<Document[]> {
    const db = this.getDb()
    const rows = db.prepare('SELECT * FROM documents').all()
    return rows.map((row) => this.mapRow(row))
  }

  public async listByFolderMappingId(folderMappingId: string): Promise<Document[]> {
    const db = this.getDb()
    const rows = db
      .prepare('SELECT * FROM documents WHERE folderMappingId = ?')
      .all(folderMappingId)
    return rows.map((row) => this.mapRow(row))
  }
}
