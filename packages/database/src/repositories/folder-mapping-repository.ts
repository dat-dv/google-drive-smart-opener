import DatabaseConnection from 'better-sqlite3'
import { FolderMappingRepository } from '@core/ports/repositories'
import { FolderMapping, FolderMappingStatus } from '@shared/types'

/**
 * SQLite implementation of FolderMappingRepository using better-sqlite3.
 */
export class SQLiteFolderMappingRepository implements FolderMappingRepository {
  private readonly getDb: () => DatabaseConnection.Database

  /**
   * Constructs the repository with a database client getter.
   * Using a getter prevents holding stale references if the connection reconnects.
   */
  constructor(getDb: () => DatabaseConnection.Database) {
    this.getDb = getDb
  }

  /**
   * Maps a database row back into the domain FolderMapping entity.
   */
  private mapRow(row: unknown): FolderMapping {
    const r = row as {
      id: string
      localFolderPath: string
      driveFolderPath: string
      status: string
      createdAt: string
      updatedAt: string
    }

    return {
      id: r.id,
      localFolderPath: r.localFolderPath,
      driveFolderPath: r.driveFolderPath,
      status: r.status as FolderMappingStatus,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }
  }

  public async findById(id: string): Promise<FolderMapping | null> {
    const db = this.getDb()
    const row = db.prepare('SELECT * FROM folder_mappings WHERE id = ?').get(id)
    return row ? this.mapRow(row) : null
  }

  public async findByLocalFolderPath(localFolderPath: string): Promise<FolderMapping | null> {
    const db = this.getDb()
    const row = db
      .prepare('SELECT * FROM folder_mappings WHERE localFolderPath = ?')
      .get(localFolderPath)
    return row ? this.mapRow(row) : null
  }

  public async findByDriveFolderPath(driveFolderPath: string): Promise<FolderMapping | null> {
    const db = this.getDb()
    const row = db
      .prepare('SELECT * FROM folder_mappings WHERE driveFolderPath = ?')
      .get(driveFolderPath)
    return row ? this.mapRow(row) : null
  }

  public async create(mapping: FolderMapping): Promise<void> {
    const db = this.getDb()
    db.prepare(
      `
      INSERT INTO folder_mappings (id, localFolderPath, driveFolderPath, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      mapping.id,
      mapping.localFolderPath,
      mapping.driveFolderPath,
      mapping.status,
      mapping.createdAt,
      mapping.updatedAt
    )
  }

  public async update(mapping: FolderMapping): Promise<void> {
    const db = this.getDb()
    const result = db
      .prepare(
        `
      UPDATE folder_mappings
      SET localFolderPath = ?, driveFolderPath = ?, status = ?, updatedAt = ?
      WHERE id = ?
    `
      )
      .run(
        mapping.localFolderPath,
        mapping.driveFolderPath,
        mapping.status,
        mapping.updatedAt,
        mapping.id
      )

    if (result.changes === 0) {
      throw new Error(`FolderMapping with ID ${mapping.id} not found for update`)
    }
  }

  public async delete(id: string): Promise<void> {
    const db = this.getDb()
    db.prepare('DELETE FROM folder_mappings WHERE id = ?').run(id)
  }

  public async list(): Promise<FolderMapping[]> {
    const db = this.getDb()
    const rows = db.prepare('SELECT * FROM folder_mappings').all()
    return rows.map((row) => this.mapRow(row))
  }
}
