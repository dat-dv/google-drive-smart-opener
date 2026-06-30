import DatabaseConnection from 'better-sqlite3';
import { OfflineTaskRepository } from '@core/ports/repositories';
import { OfflineTask } from '@shared/types';

/**
 * SQLite implementation of OfflineTaskRepository using better-sqlite3.
 */
export class SQLiteOfflineTaskRepository implements OfflineTaskRepository {
  private readonly getDb: () => DatabaseConnection.Database;

  /**
   * Constructs the repository with a database connection getter.
   */
  constructor(getDb: () => DatabaseConnection.Database) {
    this.getDb = getDb;
  }

  private mapRow(row: unknown): OfflineTask {
    const r = row as {
      id: string;
      type: string;
      payload: string;
      createdAt: string;
      status: string;
    };

    return {
      id: r.id,
      type: r.type as 'IMPORT_FILE' | 'SYNC_STATUS',
      payload: r.payload,
      createdAt: r.createdAt,
      status: r.status as 'PENDING' | 'COMPLETED' | 'FAILED',
    };
  }

  public async create(task: OfflineTask): Promise<void> {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO offline_tasks (id, type, payload, createdAt, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(task.id, task.type, task.payload, task.createdAt, task.status);
  }

  public async update(task: OfflineTask): Promise<void> {
    const db = this.getDb();
    const result = db.prepare(`
      UPDATE offline_tasks
      SET type = ?, payload = ?, createdAt = ?, status = ?
      WHERE id = ?
    `).run(task.type, task.payload, task.createdAt, task.status, task.id);

    if (result.changes === 0) {
      throw new Error(`Offline task with ID ${task.id} not found for update`);
    }
  }

  public async delete(id: string): Promise<void> {
    const db = this.getDb();
    db.prepare('DELETE FROM offline_tasks WHERE id = ?').run(id);
  }

  public async listPending(): Promise<OfflineTask[]> {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM offline_tasks WHERE status = "PENDING" ORDER BY createdAt ASC').all();
    return rows.map((row) => this.mapRow(row));
  }
}
