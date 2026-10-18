/**
 * Sentry & Production Error Monitoring Bridge — PicklePunto
 *
 * Provides a standardized error and performance telemetry interface.
 * When NEXT_PUBLIC_SENTRY_DSN or SENTRY_DSN is provided in environment variables,
 * errors are forwarded to Sentry. In development or offline mode, errors are formatted
 * with contextual metadata and logged to server/console telemetry.
 */

export interface ErrorContext {
  tags?: Record<string, string | number | boolean>;
  extra?: Record<string, unknown>;
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
  componentStack?: string;
}

const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  process.env.SENTRY_DSN ||
  null;

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function isSentryConfigured(): boolean {
  return Boolean(SENTRY_DSN);
}

/**
 * Capture an exception and send to Sentry / diagnostic logger
 */
export function captureException(error: unknown, context?: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const timestamp = new Date().toISOString();

  // Structured diagnostic payload
  const payload = {
    level: 'error',
    timestamp,
    name: err.name,
    message: err.message,
    stack: err.stack,
    context: context || {},
    dsnConfigured: isSentryConfigured(),
  };

  if (isSentryConfigured() && typeof window !== 'undefined' && (window as any).Sentry) {
    try {
      (window as any).Sentry.captureException(err, {
        tags: context?.tags,
        extra: context?.extra,
        user: context?.user,
      });
    } catch (sentryErr) {
      console.error('[Telemetry] Failed to deliver to Sentry client:', sentryErr);
    }
  } else {
    // Development / Server Console Telemetry
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `%c[Error Tracker ${timestamp}] ${err.name}: ${err.message}`,
        'color: #ef4444; font-weight: bold;',
        payload
      );
    }
  }
}

/**
 * Capture an informational or warning message
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: ErrorContext): void {
  const timestamp = new Date().toISOString();

  if (isSentryConfigured() && typeof window !== 'undefined' && (window as any).Sentry) {
    try {
      (window as any).Sentry.captureMessage(message, level);
    } catch (sentryErr) {
      console.error('[Telemetry] Failed to deliver message to Sentry client:', sentryErr);
    }
  } else {
    const color = level === 'error' ? '#ef4444' : level === 'warning' ? '#f59e0b' : '#38bdf8';
    console.log(`%c[Telemetry ${level.toUpperCase()}] ${message}`, `color: ${color};`, { timestamp, context });
  }
}
