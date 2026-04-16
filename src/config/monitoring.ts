/**
 * Error monitoring configuration.
 *
 * Wire your preferred monitoring provider here (Sentry, Axiom, LogTail, etc.).
 * When configured, the logger will forward errors and warnings to your provider.
 * Zero-cost when not configured — the callback is a no-op.
 *
 * Example (Sentry):
 *   import * as Sentry from '@sentry/nextjs';
 *   setMonitoringProvider({
 *     captureError: (msg, data) => Sentry.captureException(new Error(msg), { extra: data }),
 *     captureWarning: (msg, data) => Sentry.captureMessage(msg, { level: 'warning', extra: data }),
 *   });
 *
 * Example (Axiom):
 *   import { Client } from '@axiomhq/axiom-node';
 *   const axiom = new Client();
 *   setMonitoringProvider({
 *     captureError: (msg, data) => axiom.ingest('errors', [{ message: msg, ...data, level: 'error' }]),
 *     captureWarning: (msg, data) => axiom.ingest('errors', [{ message: msg, ...data, level: 'warning' }]),
 *   });
 */

export interface MonitoringProvider {
  /** Called on every logger.error() call */
  captureError: (message: string, data?: Record<string, unknown>) => void;
  /** Called on every logger.warn() call (optional — defaults to no-op) */
  captureWarning?: (message: string, data?: Record<string, unknown>) => void;
}

let provider: MonitoringProvider | null = null;

/** Register a monitoring provider. Call once at server startup (e.g. in server.ts). */
export function setMonitoringProvider(p: MonitoringProvider): void {
  provider = p;
}

/** Get the current monitoring provider (null if not configured). */
export function getMonitoringProvider(): MonitoringProvider | null {
  return provider;
}
