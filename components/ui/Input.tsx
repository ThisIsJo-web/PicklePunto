'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils/cn';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftAddon, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={styles.wrapper}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {props.required && <span className={styles.required} aria-hidden>*</span>}
          </label>
        )}
        <div className={cn(styles.inputWrap, error && styles.hasError)}>
          {leftAddon && <span className={styles.addon}>{leftAddon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn(styles.input, leftAddon && styles.withAddon, className)}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
        </div>
        {error && (
          <p id={`${inputId}-error`} className={styles.error} role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className={styles.hint}>{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
