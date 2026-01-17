/**
 * Centralized logging abstraction for the application.
 *
 * This module provides a simple, structured logging interface that can be easily
 * swapped for a production logging provider (e.g., Winston, Pino, Datadog, Sentry)
 * in the future without changing calling code.
 *
 * Current implementation uses console output with structured JSON formatting.
 * Future enhancements could include:
 * - Integration with structured logging providers (Winston, Pino)
 * - Log aggregation services (Datadog, CloudWatch, etc.)
 * - Error tracking (Sentry, Rollbar)
 * - Metrics/telemetry integration
 * - Request correlation IDs
 * - Log levels and filtering
 * - Output formatting (JSON, pretty-print, etc.)
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogMeta {
  [key: string]: unknown;
}

/**
 * Structured log entry format.
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: LogMeta;
}

/**
 * Formats a log entry as JSON for structured logging.
 */
function formatLogEntry(level: LogLevel, message: string, meta?: LogMeta): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  };

  return JSON.stringify(entry);
}

/**
 * Logs an informational message.
 * @param message Human-readable log message
 * @param meta Optional structured metadata (e.g., { ticketId, status })
 */
export function info(message: string, meta?: LogMeta): void {
  // eslint-disable-next-line no-console
  console.log(formatLogEntry('info', message, meta));
}

/**
 * Logs a warning message.
 * @param message Human-readable log message
 * @param meta Optional structured metadata (e.g., { ticketId, errorCode })
 */
export function warn(message: string, meta?: LogMeta): void {
  // eslint-disable-next-line no-console
  console.warn(formatLogEntry('warn', message, meta));
}

/**
 * Logs an error message.
 * @param message Human-readable log message
 * @param meta Optional structured metadata (e.g., { ticketId, errorCode, errorMessage })
 */
export function error(message: string, meta?: LogMeta): void {
  // eslint-disable-next-line no-console
  console.error(formatLogEntry('error', message, meta));
}

