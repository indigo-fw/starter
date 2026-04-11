/**
 * Maintenance task registry — modules/project register cleanup tasks,
 * core runs them sequentially with independent error handling.
 */

import { createLogger } from './logger';

const logger = createLogger('maintenance');

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface MaintenanceTask {
  name: string;
  fn: () => Promise<void>;
}

const tasks: MaintenanceTask[] = [];

/** Register a maintenance task. Called by project or modules during startup. */
export function registerMaintenanceTask(name: string, fn: () => Promise<void>): void {
  tasks.push({ name, fn });
}

/**
 * Run all registered maintenance tasks sequentially.
 * Each task catches its own errors independently — one failure doesn't block others.
 */
export async function runAllMaintenanceTasks(): Promise<void> {
  if (tasks.length === 0) {
    logger.info('No maintenance tasks registered');
    return;
  }

  logger.info(`Running ${tasks.length} maintenance tasks`);

  for (const task of tasks) {
    try {
      await task.fn();
    } catch (err) {
      logger.error(`Maintenance task failed: ${task.name}`, { error: String(err) });
    }
  }

  logger.info('Maintenance tasks complete');
}
