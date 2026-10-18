import styles from './Badge.module.css';

type BadgeVariant = 'status' | 'role' | 'default';

interface BadgeProps {
  label: string;
  /** Must match a [data-status] token in globals.css */
  status?: string;
  variant?: BadgeVariant;
}

/** Displays a coloured pill badge — status colour driven by globals.css data-status tokens */
export default function Badge({ label, status }: BadgeProps) {
  return (
    <span className={styles.badge} data-status={status}>
      {label}
    </span>
  );
}
