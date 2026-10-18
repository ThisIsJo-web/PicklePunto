'use client';

import { useEffect } from 'react';
import { captureException } from '@/lib/sentry';

export default function GlobalFatalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { extra: { fatal: true, digest: error.digest } });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#f7fbf8',
          color: '#0f2a1d',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            background: '#ffffff',
            border: '1px solid #dbe8df',
            boxShadow: '0 18px 44px rgba(15, 42, 29, 0.12)',
            borderRadius: '24px',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏓🚨</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
            System Encountered an Issue
          </h1>
          <p style={{ color: '#46604f', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            A critical application error occurred. You can reload the page or return to the application.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: '#f0553a',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 4px 0 #a8321c',
              borderRadius: '12px',
              padding: '0.65rem 1.25rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload PicklePunto
          </button>
        </div>
      </body>
    </html>
  );
}
