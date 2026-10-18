// ─── CSS Class Merge Utility ──────────────────────────────────────────────────
// Lightweight alternative to clsx for combining class names without a dependency.

export function cn(...classes: unknown[]): string {
  return classes.filter(Boolean).join(' ');
}
