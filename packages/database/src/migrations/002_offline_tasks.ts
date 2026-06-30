export const offlineTasksMigration = {
  version: 2,
  up: `
    CREATE TABLE IF NOT EXISTS offline_tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_offline_tasks_status ON offline_tasks(status);
  `,
  down: `
    DROP INDEX IF EXISTS idx_offline_tasks_status;
    DROP TABLE IF EXISTS offline_tasks;
  `
}
