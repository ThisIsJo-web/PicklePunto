'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { captureException } from '@/lib/sentry';
import Button from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log exception to Sentry / Telemetry
    captureException(error, {
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-base, #0b1120)',
        color: 'var(--color-text-primary, #f8fafc)',
        padding: '1.5rem',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          background: 'var(--color-bg-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '16px',
          padding: '2rem',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏓 ⚠️</div>
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            color: 'var(--color-text-primary)',
          }}
        >
          Something went wrong
        </h2>
        <p
          style={{
            fontSize: '0.9rem',
            color: 'var(--color-text-secondary)',
            marginBottom: '1.5rem',
            lineHeight: 1.5,
          }}
        >
          An unexpected error occurred during court processing. The incident has been recorded for diagnostics.
        </p>

        {error.digest && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--color-wash)',
              borderRadius: '8px',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              marginBottom: '1.5rem',
              fontFamily: 'monospace',
            }}
          >
            Error Code: {error.digest}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <Button variant="secondary" onClick={() => reset()}>
            🔄 Try Again
          </Button>
          <Link href="/login" style={{ textDecoration: 'none' }}>
            <Button variant="primary">Return Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
