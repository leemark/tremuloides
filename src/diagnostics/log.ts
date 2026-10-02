export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  t: string;
  level: LogLevel;
  source: string;
  message: string;
  detail?: string;
}

const MAX_MEMORY = 200;
const memory: LogEntry[] = [];
let sink: ((e: LogEntry) => void) | null = null;

/** Persists entries (set once storage is ready). Buffered entries are flushed immediately. */
export function setLogSink(fn: (e: LogEntry) => void): void {
  sink = fn;
  for (const e of memory) fn(e);
}

export function logEvent(level: LogLevel, source: string, message: string, detail?: unknown): void {
  const entry: LogEntry = { t: new Date().toISOString(), level, source, message };
  if (detail !== undefined) entry.detail = stringify(detail);
  memory.push(entry);
  if (memory.length > MAX_MEMORY) memory.shift();
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  fn(`[${source}] ${message}`, detail ?? '');
  try {
    sink?.(entry);
  } catch {
    /* never let logging throw */
  }
}

export function sessionLogs(): readonly LogEntry[] {
  return memory;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function stringify(detail: unknown): string {
  if (detail instanceof Error) {
    const extra = (detail as Error & { log?: string }).log;
    return [detail.name, detail.message, extra, detail.stack?.split('\n').slice(0, 4).join('\n')]
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000);
  }
  if (typeof detail === 'string') return detail.slice(0, 2000);
  try {
    return JSON.stringify(detail).slice(0, 2000);
  } catch {
    return String(detail).slice(0, 2000);
  }
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) => {
    logEvent('error', 'window', e.message || 'Uncaught error', e.error ?? `${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    logEvent('error', 'promise', 'Unhandled rejection', e.reason);
  });
}
