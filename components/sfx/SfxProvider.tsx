'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { sfx, initSfx, isMuted, subscribeSfx, type SfxName } from '@/lib/sfx/sfx';

/**
 * Hook for explicit sounds + mute state:
 *   const { play, muted, toggle } = useSfx();
 *   play('success');
 */
export function useSfx() {
  const muted = useSyncExternalStore(subscribeSfx, isMuted, () => false);
  return {
    muted,
    play: (name: SfxName) => sfx.play(name),
    toggle: () => sfx.setMuted(!isMuted()),
  };
}

/**
 * Mounted once in the root layout. Adds delegated listeners so EVERY button /
 * link in the app gets tactile audio feedback automatically:
 *
 *   data-sfx="pop|select|coin|success|error|whoosh|tap|none"   → override
 *   (default)  <a href>  → whoosh,   <button> / role=button → tap
 *   hover ticks only on devices with a real pointer (not touch)
 */
export default function SfxProvider() {
  useEffect(() => {
    initSfx();

    const SELECTOR = 'button, a[href], [role="button"], [role="tab"], summary, [data-sfx]';

    const resolve = (el: Element): SfxName | null => {
      const target = el.closest(SELECTOR) as HTMLElement | null;
      if (!target) return null;
      if (target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return null;
      const explicit = target.getAttribute('data-sfx') as SfxName | null;
      if (explicit) return explicit;
      if (target.tagName === 'A') {
        const href = target.getAttribute('href') || '';
        if (href.startsWith('#') || target.getAttribute('target') === '_blank') return 'tap';
        return 'whoosh';
      }
      return 'tap';
    };

    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      const name = resolve(e.target);
      if (name) sfx.play(name);
    };

    const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    let lastHovered: Element | null = null;
    const onOver = (e: PointerEvent) => {
      if (!canHover || !(e.target instanceof Element)) return;
      const hit = e.target.closest('[data-sfx-hover]');
      if (hit && hit !== lastHovered) {
        lastHovered = hit;
        sfx.play('hover');
      } else if (!hit) {
        lastHovered = null;
      }
    };

    document.addEventListener('pointerdown', onDown, { capture: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown, { capture: true });
      document.removeEventListener('pointerover', onOver);
    };
  }, []);

  return null;
}
