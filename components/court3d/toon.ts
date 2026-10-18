/**
 * Shared toolkit for the 3D cartoon look:
 *  - 3-step "cel" gradient for MeshToonMaterial
 *  - inverted-hull outline shader (the thick ink outline you see on cartoons)
 *  - cached RoundedBox geometry (everything in this world is chunky + rounded)
 *  - tiny canvas textures (court label, net mesh, hazard stripes, blob shadow)
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ── Palette (mirrors globals.css) ─────────────────────────────────────────────
export const PAL = {
  ink: '#0f2a1d',
  line: '#ffffff',
  lime: '#c6f432',
  limeDeep: '#9fd41a',
  coral: '#ff6b4a',
  blue: '#3aa8ff',
  amber: '#ffb524',
  red: '#ff5a4a',
  post: '#3a5f4c',
  skin: ['#ffd9b8', '#e9b48a', '#c98f66', '#8d5a3b'],
  hair: ['#3b2a20', '#1b1b1b', '#a55a2b', '#e8c25a'],
  shirt: ['#ff6b4a', '#3aa8ff', '#ffb524', '#8f6bff'],
};

/** Court surface + apron colours per live state — echoes the status badges. */
export const STATE_COLORS = {
  AVAILABLE: { apron: '#1f8a5b', court: '#5fd993', kitchen: '#c6f432' },
  USING:     { apron: '#12a35a', court: '#46cf86', kitchen: '#b4ea2c' },
  RESERVED:  { apron: '#d9961c', court: '#8fdcae', kitchen: '#ffe08a' },
  BOOKED:    { apron: '#2f7fd1', court: '#6ec3f0', kitchen: '#bfe6ff' },
  BLOCKED:   { apron: '#c8483c', court: '#e39a90', kitchen: '#f3c0b8' },
  CLOSED:    { apron: '#7d8c84', court: '#b4c0b9', kitchen: '#cdd6d0' },
} as const;

// ── Cel-shading gradient ──────────────────────────────────────────────────────
let _gradient: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (_gradient) return _gradient;
  const data = new Uint8Array([105, 185, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradient = tex;
  return tex;
}

// ── Outline material (inverted hull) ──────────────────────────────────────────
const _outlineCache = new Map<string, THREE.ShaderMaterial>();
export function outlineMaterial(thickness: number, color: string = PAL.ink): THREE.ShaderMaterial {
  const key = `${thickness}|${color}`;
  const hit = _outlineCache.get(key);
  if (hit) return hit;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uT: { value: thickness } },
    vertexShader: /* glsl */ `
      uniform float uT;
      void main() {
        vec3 p = position + normalize(normal) * uT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  _outlineCache.set(key, mat);
  return mat;
}

// ── Geometry cache ────────────────────────────────────────────────────────────
const _geo = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = _geo.get(key);
  if (!g) {
    g = make();
    _geo.set(key, g);
  }
  return g as T;
}
export const rbox = (w: number, h: number, d: number, r = 0.03) =>
  cached(`rb|${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
export const sphere = (r: number, seg = 20) => cached(`sp|${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg - 6)));
export const capsule = (r: number, len: number) => cached(`cap|${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 14));
export const cone = (r: number, h: number, seg = 18) => cached(`cone|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
export const cyl = (rt: number, rb: number, h: number, seg = 16) => cached(`cyl|${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
export const torus = (r: number, t: number, seg = 28) => cached(`tor|${r}|${t}|${seg}`, () => new THREE.TorusGeometry(r, t, 10, seg));
export const plane = (w: number, h: number) => cached(`pl|${w}|${h}`, () => new THREE.PlaneGeometry(w, h));
export const circle = (r: number) => cached(`ci|${r}`, () => new THREE.CircleGeometry(r, 28));
export const hemisphere = (r: number) =>
  cached(`hemi|${r}`, () => new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2));

// ── Canvas textures ───────────────────────────────────────────────────────────
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const _tex = new Map<string, THREE.CanvasTexture>();

export function labelTexture(text: string): THREE.CanvasTexture {
  const key = `label|${text}`;
  const hit = _tex.get(key);
  if (hit) return hit;
  const draw = (g: CanvasRenderingContext2D) => {
    g.clearRect(0, 0, 512, 128);
    g.font = '700 84px Fredoka, "Arial Rounded MT Bold", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 12;
    g.strokeStyle = 'rgba(15,42,29,0.55)';
    g.strokeText(text.toUpperCase(), 256, 68);
    g.fillStyle = '#ffffff';
    g.fillText(text.toUpperCase(), 256, 68);
  };
  const tex = canvasTex(512, 128, draw);
  _tex.set(key, tex);
  // Redraw once the display font arrives so the label doesn't stay in fallback font
  if (typeof document !== 'undefined' && document.fonts?.load) {
    document.fonts.load('700 84px Fredoka').then(() => {
      draw((tex.image as HTMLCanvasElement).getContext('2d')!);
      tex.needsUpdate = true;
    }).catch(() => undefined);
  }
  return tex;
}

export function netTexture(): THREE.CanvasTexture {
  const hit = _tex.get('net');
  if (hit) return hit;
  const tex = canvasTex(256, 64, (g) => {
    g.clearRect(0, 0, 256, 64);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    for (let x = 0; x <= 256; x += 16) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 64);
      g.stroke();
    }
    for (let y = 0; y <= 64; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _tex.set('net', tex);
  return tex;
}

export function hazardTexture(): THREE.CanvasTexture {
  const hit = _tex.get('hazard');
  if (hit) return hit;
  const tex = canvasTex(256, 64, (g) => {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#1b1b1b';
    for (let x = -64; x < 300; x += 48) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 24, 64);
      g.lineTo(x + 24 + 64, 0);
      g.lineTo(x + 64, 0);
      g.closePath();
      g.fill();
    }
  });
  _tex.set('hazard', tex);
  return tex;
}

export function blobShadowTexture(): THREE.CanvasTexture {
  const hit = _tex.get('blob');
  if (hit) return hit;
  const tex = canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(15,42,29,0.38)');
    grd.addColorStop(0.55, 'rgba(15,42,29,0.16)');
    grd.addColorStop(1, 'rgba(15,42,29,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
  _tex.set('blob', tex);
  return tex;
}
