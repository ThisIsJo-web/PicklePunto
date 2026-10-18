'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils/cn';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, loading, leftIcon, className, children, disabled, ...props }, ref) => {
    const isSpinnerActive = isLoading || loading;
    return (
      <button
        ref={ref}
        className={cn(styles.btn, styles[variant], styles[size], className)}
        disabled={disabled || isSpinnerActive}
        data-sfx={variant === 'primary' ? 'pop' : undefined}
        {...props}
      >
        {isSpinnerActive ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : leftIcon ? (
          <span className={styles.icon}>{leftIcon}</span>
        ) : null}
        <span>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
