import DatabaseConnection from 'better-sqlite3';
import { migrations } from './migrations';

/**
 * Manages the SQLite database connection, lifecycle, and schema migrations.
 */
export class DatabaseManager {
  private db: DatabaseConnection.Database | null = null;
  private readonly dbPath: string;

  /**
   * Initializes the DatabaseManager with a file path or ':memory:' for tests.
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Opens the SQLite connection and executes pending migrations.
   * Uses better-sqlite3's synchronous APIs for optimal local performance.
   */
  public connect(): void {
    if (this.db) {
      return;
    }

    try {
      this.db = new DatabaseConnection(this.dbPath, {
        fileMustExist: false,
        timeout: 5000,
      });

      // Enable foreign key support and WAL mode for concurrent read/write efficiency
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');

      this.runMigrations();
    } catch (error) {
      // Explicit error handling and clean connection state
      this.db = null;
      throw new Error(`Failed to initialize SQLite database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Closes the active database connection.
   */
  public disconnect(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Returns the underlying better-sqlite3 Database instance.
   * Throws if the database is not connected.
   */
  public getDatabase(): DatabaseConnection.Database {
    if (!this.db) {
      throw new Error('Database is not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Executes database migrations sequentially up to the latest version.
   * Runs the process within a transaction to guarantee atomic, crash-safe schema updates.
   */
  private runMigrations(): void {
    const db = this.getDatabase();

    // Create the meta table if it doesn't exist yet to check schema version
    db.prepare(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `).run();

    // Check current database schema version
    const versionRow = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    let currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;

    const latestVersion = migrations.length;
    if (currentVersion >= latestVersion) {
      return; // Already up to date
    }

    // Execute outstanding migrations within a transaction
    const executeMigrationTransaction = db.transaction((pendingMigrations) => {
      for (const migration of pendingMigrations) {
        // Run migration statements
        db.exec(migration.up);
        currentVersion = migration.version;
        // Update database schema version
        db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(String(currentVersion));
      }
    });

    const pending = migrations.filter((m) => m.version > currentVersion);
    executeMigrationTransaction(pending);
  }
}
