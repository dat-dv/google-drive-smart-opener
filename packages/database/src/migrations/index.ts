import { initialMigration } from './001_initial';
import { offlineTasksMigration } from './002_offline_tasks';

/**
 * Migration type definition.
 */
export interface Migration {
  version: number;
  up: string;
  down: string;
}

/**
 * Sorted list of migrations to run sequentially.
 */
export const migrations: Migration[] = [
  initialMigration,
  offlineTasksMigration
];
