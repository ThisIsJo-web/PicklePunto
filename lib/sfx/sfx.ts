/**
 * PicklePunto SFX — a tiny Web Audio synthesiser. No audio files.
 *
 * Every sound is deliberately quiet and short (<= 450ms) so it feels like
 * tactile feedback, not noise. The headline sound is the "pock" of a
 * pickleball meeting a paddle, used for primary actions.
 *
 * - Lazily creates the AudioContext on first user gesture (autoplay policy).
 * - Mute state is persisted in localStorage and defaults to muted for users
 *   who prefer reduced motion.
 */

export type SfxName =
  | 'tap'
  | 'hover'
  | 'select'
  | 'deselect'
  | 'pop'
  | 'whoosh'
  | 'success'
  | 'error'
  | 'coin'
  | 'toggleOn'
  | 'toggleOff'
  | 'none';

const STORAGE_KEY = 'pp-sfx-muted';
const MASTER_GAIN = 0.55;

type Listener = () => void;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;
let initialised = false;
const listeners = new Set<Listener>();
const lastPlayed: Partial<Record<SfxName, number>> = {};

function emit() {
  listeners.forEach((l) => l());
}

/** Read persisted preference once (client only). */
export function initSfx() {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      muted = stored === '1';
    } else {
      muted = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    }
  } catch {
    muted = false;
  }
  emit();
}

export function isMuted() {
  return muted;
}

export function subscribeSfx(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* storage unavailable — fine */
  }
  emit();
  if (!next) play('toggleOn', true);
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const len = Math.floor(c.sampleRate * 0.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

// ── Building blocks ───────────────────────────────────────────────────────────
interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to?: number;
  start?: number;
  dur: number;
  gain: number;
  attack?: number;
}

function tone(c: AudioContext, o: ToneOpts) {
  const t0 = c.currentTime + (o.start ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.from, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const attack = o.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.03);
}

function noise(
  c: AudioContext,
  o: { start?: number; dur: number; gain: number; freq: number; freqTo?: number; q?: number; filter?: BiquadFilterType }
) {
  const t0 = c.currentTime + (o.start ?? 0);
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const f = c.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.Q.value = o.q ?? 1.2;
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t0 + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t0);
  src.stop(t0 + o.dur + 0.03);
}

// ── Sound recipes ─────────────────────────────────────────────────────────────
const recipes: Record<Exclude<SfxName, 'none'>, (c: AudioContext) => void> = {
  // Soft UI tick
  tap: (c) => tone(c, { from: 540, to: 400, dur: 0.07, gain: 0.07 }),

  // Almost-subliminal hover tick
  hover: (c) => tone(c, { from: 900, to: 820, dur: 0.035, gain: 0.018 }),

  // Rising two-note — picking a slot / court / option
  select: (c) => {
    tone(c, { type: 'triangle', from: 620, dur: 0.09, gain: 0.07 });
    tone(c, { type: 'triangle', from: 930, start: 0.06, dur: 0.12, gain: 0.07 });
  },

  deselect: (c) => tone(c, { type: 'triangle', from: 520, to: 340, dur: 0.1, gain: 0.05 }),

  // The "pock" of a pickleball on a paddle
  pop: (c) => {
    noise(c, { dur: 0.06, gain: 0.16, freq: 1700, q: 2.2 });
    tone(c, { type: 'sine', from: 460, to: 190, dur: 0.1, gain: 0.12 });
  },

  // Page / navigation swish
  whoosh: (c) => noise(c, { dur: 0.22, gain: 0.05, freq: 380, freqTo: 2400, q: 0.9 }),

  // Booking confirmed — bright major arpeggio
  success: (c) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(c, { type: 'triangle', from: f, start: i * 0.075, dur: 0.22, gain: 0.085 })
    );
    noise(c, { start: 0.28, dur: 0.18, gain: 0.025, freq: 5200, q: 0.6, filter: 'highpass' });
  },

  // Gentle "nope" — two falling notes, not harsh
  error: (c) => {
    tone(c, { type: 'square', from: 220, dur: 0.11, gain: 0.04 });
    tone(c, { type: 'square', from: 165, start: 0.1, dur: 0.16, gain: 0.04 });
  },

  // Item added to cart / payment received
  coin: (c) => {
    tone(c, { type: 'square', from: 1318, dur: 0.06, gain: 0.04 });
    tone(c, { type: 'square', from: 1975, start: 0.055, dur: 0.16, gain: 0.04 });
  },

  toggleOn: (c) => {
    tone(c, { type: 'triangle', from: 520, dur: 0.07, gain: 0.07 });
    tone(c, { type: 'triangle', from: 780, start: 0.06, dur: 0.1, gain: 0.07 });
  },
  toggleOff: (c) => {
    tone(c, { type: 'triangle', from: 700, dur: 0.07, gain: 0.06 });
    tone(c, { type: 'triangle', from: 440, start: 0.06, dur: 0.1, gain: 0.06 });
  },
};

// Minimum spacing between repeats of the same sound (ms) to avoid machine-gunning
const THROTTLE: Partial<Record<SfxName, number>> = { hover: 90, tap: 40, select: 50, whoosh: 120 };

/** Play a named sound. `force` bypasses mute (used for the unmute confirmation). */
export function play(name: SfxName, force = false) {
  if (name === 'none') return;
  if (!initialised) initSfx();
  if (muted && !force) return;

  const now = performance.now();
  const gap = THROTTLE[name] ?? 0;
  if (gap && now - (lastPlayed[name] ?? 0) < gap) return;
  lastPlayed[name] = now;

  const c = ensureCtx();
  if (!c || !master) return;
  try {
    recipes[name](c);
  } catch {
    /* never let audio break the UI */
  }
}

export const sfx = { play, setMuted, isMuted, initSfx, subscribeSfx };
