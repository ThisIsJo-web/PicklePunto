'use client';

import { useSfx } from './SfxProvider';
import styles from './SoundToggle.module.css';

/** Speaker button — toggles all UI sounds. Preference persists in localStorage. */
export default function SoundToggle({ className = '' }: { className?: string }) {
  const { muted, toggle } = useSfx();

  return (
    <button
      type="button"
      id="btn-sound-toggle"
      data-sfx="none"
      className={`${styles.toggle} ${muted ? styles.off : ''} ${className}`}
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? 'Turn sound effects on' : 'Turn sound effects off'}
      title={muted ? 'Sound off — tap to enable' : 'Sound on — tap to mute'}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" fillOpacity="0.15" />
        {muted ? (
          <>
            <path d="M16.5 9.5l5 5" />
            <path d="M21.5 9.5l-5 5" />
          </>
        ) : (
          <>
            <path className={styles.wave1} d="M15.5 9.2a4 4 0 010 5.6" />
            <path className={styles.wave2} d="M18 6.8a7.5 7.5 0 010 10.4" />
          </>
        )}
      </svg>
    </button>
  );
}
