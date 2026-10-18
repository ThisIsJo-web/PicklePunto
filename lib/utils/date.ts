import { format, parseISO, isValid } from 'date-fns';

// ─── Date Formatting Helpers ──────────────────────────────────────────────────

/** Format a Date or ISO string as "Mon, Oct 18 2026" */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isValid(d) ? format(d, 'EEE, MMM d yyyy') : '—';
}

/** Format a Date or ISO string as "2:30 PM" */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isValid(d) ? format(d, 'h:mm a') : '—';
}

/** Format a Date or ISO string as "Oct 18, 2:30 PM" */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isValid(d) ? format(d, 'MMM d, h:mm a') : '—';
}

/** Format a Date as YYYY-MM-DD (for HTML date inputs) */
export function toInputDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Get today's date as YYYY-MM-DD string */
export function todayInputDate(): string {
  return toInputDate(new Date());
}

/** Convert "HH:MM" string to readable "H:MM AM/PM" */
export function formatTimeString(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}
