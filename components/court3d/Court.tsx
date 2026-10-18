'use client';

import { memo, useRef } from 'react';
import { useFrame, type GroupProps, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import {
  PAL, STATE_COLORS, toonGradient, outlineMaterial,
  rbox, sphere, capsule, cone, cyl, torus, plane, hemisphere,
  labelTexture, netTexture, hazardTexture, blobShadowTexture,
} from './toon';
import type { CourtVisualState } from './types';

/* ─────────────────────────────────────────────────────────────────────────────
   A single cartoon pickleball court.
   Court-local axes:  x = long axis (net sits at x=0),  z = across,  y = up.
   1 unit ≈ 10 ft  →  playing area 4.4 × 2.0, kitchen (non-volley) ±0.7 of net.
───────────────────────────────────────────────────────────────────────────── */

interface ToonProps extends GroupProps {
  geo: THREE.BufferGeometry;
  color: string;
  outline?: number;
  matRef?: React.Ref<THREE.MeshToonMaterial>;
  map?: THREE.Texture;
}

/** Cel-shaded mesh + inked outline. */
function Toon({ geo, color, outline = 0.02, matRef, map, children, ...rest }: ToonProps) {
  return (
    <group {...rest}>
      <mesh geometry={geo}>
        <meshToonMaterial ref={matRef} color={color} map={map} gradientMap={toonGradient()} />
      </mesh>
      {outline > 0 && <mesh geometry={geo} material={outlineMaterial(outline)} />}
      {children}
    </group>
  );
}

const _c = new THREE.Color();

// ── Rally shared between ball + players ───────────────────────────────────────
interface RallyState {
  u: number;
  fromLeft: boolean;
  zStart: number;
  zEnd: number;
}

function Ball({ r = 0.075 }: { r?: number }) {
  return (
    <Toon geo={sphere(r, 18)} color="#e4ff3a" outline={0.012}>
      {/* pickleball holes */}
      {[
        [0.04, 0.05, 0.04], [-0.05, 0.03, 0.04], [0.0, -0.06, 0.04], [0.05, -0.03, -0.04], [-0.03, 0.06, -0.05],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} geometry={sphere(0.011, 8)}>
          <meshBasicMaterial color="#7a9a10" />
        </mesh>
      ))}
    </Toon>
  );
}

function Rally({ animate, seed, rally }: { animate: boolean; seed: number; rally: React.MutableRefObject<RallyState> }) {
  const ball = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);

  useFrame((st) => {
    if (!ball.current || !shadow.current) return;
    const T = 1.5;
    const t = animate ? st.clock.elapsedTime + seed : T * 0.35;
    const k = Math.floor(t / T);
    const u = t / T - k;
    const fromLeft = k % 2 === 0;
    const zs = Math.sin(k * 2.1 + seed) * 0.55;
    const ze = Math.sin((k + 1) * 2.1 + seed) * 0.55;
    const xs = fromLeft ? -1.75 : 1.75;
    const x = xs + (-xs - xs) * u;
    const z = zs + (ze - zs) * u;
    const y = 0.38 + 4 * 0.42 * u * (1 - u);
    ball.current.position.set(x, y, z);
    ball.current.rotation.set(t * 7, t * 5, 0);
    shadow.current.position.set(x, 0.157, z);
    shadow.current.scale.setScalar(Math.max(0.45, 1 - (y - 0.38) / 1.1));
    rally.current.u = u;
    rally.current.fromLeft = fromLeft;
    rally.current.zStart = zs;
    rally.current.zEnd = ze;
  });

  return (
    <>
      <group ref={ball}>
        <Ball />
      </group>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} geometry={plane(0.2, 0.2)}>
        <meshBasicMaterial map={blobShadowTexture()} transparent depthWrite={false} />
      </mesh>
    </>
  );
}

// ── Cartoon player ────────────────────────────────────────────────────────────
interface PlayerProps {
  position: [number, number, number];
  face: 1 | -1; // +1 faces +x, -1 faces -x
  idx: 0 | 1;
  side: 0 | 1; // 0 = left team, 1 = right team
  look: number;
  animate: boolean;
  rally?: React.MutableRefObject<RallyState>;
}

function Player({ position, face, idx, side, look, animate, rally }: PlayerProps) {
  const root = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const shirt = PAL.shirt[look % 4];
  const skin = PAL.skin[(look + 1) % 4];
  const hair = PAL.hair[(look + 2) % 4];
  const paddle = look % 2 === 0 ? PAL.coral : PAL.lime;

  useFrame((st) => {
    if (!root.current || !arm.current) return;
    const t = animate ? st.clock.elapsedTime : 0;
    let hop = animate ? Math.abs(Math.sin(t * 3 + look * 1.7)) * 0.02 : 0;
    let swing = 0.25 + (animate ? Math.sin(t * 2 + look) * 0.06 : 0);
    if (rally && animate) {
      const r = rally.current;
      const hitterSide = r.fromLeft ? 0 : 1;
      const hitterIdx = r.zStart > 0 ? 1 : 0;
      const recvIdx = r.zEnd > 0 ? 1 : 0;
      if (side === hitterSide && idx === hitterIdx) {
        const s = Math.max(0, 1 - r.u / 0.3);
        swing = 0.25 + s * 1.55;
        hop += s * 0.09;
      } else if (side !== hitterSide && idx === recvIdx) {
        const p = Math.max(0, (r.u - 0.55) / 0.45);
        swing = 0.25 - p * 0.55; // wind-up
        hop += p * 0.03;
      }
    }
    root.current.position.y = position[1] + hop;
    arm.current.rotation.x = -swing;
  });

  return (
    <group ref={root} position={position} rotation-y={face === 1 ? Math.PI / 2 : -Math.PI / 2}>
      {/* legs */}
      {[-0.05, 0.05].map((x) => (
        <Toon key={x} geo={cyl(0.034, 0.034, 0.15)} color={skin} outline={0.01} position={[x, 0.075, 0]} />
      ))}
      {/* shorts + shirt */}
      <Toon geo={capsule(0.105, 0.16)} color={shirt} outline={0.014} position={[0, 0.33, 0]} />
      {/* head */}
      <Toon geo={sphere(0.105, 18)} color={skin} outline={0.014} position={[0, 0.6, 0]}>
        {[-0.04, 0.04].map((x) => (
          <mesh key={x} position={[x, 0.01, 0.094]} geometry={sphere(0.017, 8)}>
            <meshBasicMaterial color={PAL.ink} />
          </mesh>
        ))}
        <mesh position={[0, -0.035, 0.1]} rotation-x={Math.PI} geometry={torus(0.022, 0.006, 12)}>
          <meshBasicMaterial color="#b0523a" />
        </mesh>
      </Toon>
      <Toon geo={hemisphere(0.115)} color={hair} outline={0.012} position={[0, 0.605, -0.012]} rotation-x={-0.35} />
      {/* paddle arm */}
      <group ref={arm} position={[0.14, 0.43, 0]}>
        <Toon geo={cyl(0.03, 0.03, 0.2)} color={skin} outline={0.01} position={[0.0, -0.1, 0]} />
        <group position={[0, -0.2, 0.035]}>
          <Toon geo={rbox(0.03, 0.09, 0.03, 0.012)} color={PAL.ink} outline={0} position={[0, -0.02, 0]} />
          <Toon geo={rbox(0.17, 0.2, 0.026, 0.05)} color={paddle} outline={0.012} position={[0, -0.14, 0]} />
        </group>
      </group>
    </group>
  );
}

// ── State props ───────────────────────────────────────────────────────────────
function Beacon({ animate, seed }: { animate: boolean; seed: number }) {
  const ball = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((st) => {
    const t = animate ? st.clock.elapsedTime + seed : 0.8;
    if (ball.current) {
      ball.current.position.y = 0.62 + Math.sin(t * 2.2) * 0.08;
      ball.current.rotation.y = t * 1.4;
    }
    if (ring.current && ringMat.current) {
      const p = (t * 0.55) % 1;
      ring.current.scale.setScalar(0.35 + p * 1.5);
      ringMat.current.opacity = (1 - p) * 0.75;
    }
  });

  return (
    <>
      <group ref={ball}>
        <Ball r={0.11} />
      </group>
      <mesh ref={ring} position={[0, 0.162, 0]} rotation-x={-Math.PI / 2} geometry={torus(0.5, 0.025, 36)}>
        <meshBasicMaterial ref={ringMat} color={PAL.lime} transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </>
  );
}

function HeldClock({ animate, seed }: { animate: boolean; seed: number }) {
  const g = useRef<THREE.Group>(null);
  const minute = useRef<THREE.Group>(null);
  const hour = useRef<THREE.Group>(null);

  useFrame((st) => {
    const t = animate ? st.clock.elapsedTime + seed : 1;
    if (g.current) {
      g.current.position.y = 0.95 + Math.sin(t * 1.8) * 0.07;
      g.current.rotation.y = Math.sin(t * 0.9) * 0.35;
    }
    if (minute.current) minute.current.rotation.z = -t * 2.4;
    if (hour.current) hour.current.rotation.z = -t * 0.2;
  });

  return (
    <group ref={g} position={[0, 0.95, 0]}>
      <group rotation-x={0}>
        <Toon geo={cyl(0.3, 0.3, 0.08, 28)} color={PAL.amber} outline={0.02} rotation-x={Math.PI / 2} />
        <Toon geo={cyl(0.24, 0.24, 0.09, 28)} color="#ffffff" outline={0} rotation-x={Math.PI / 2} position={[0, 0, 0.005]} />
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[Math.sin((i * Math.PI) / 2) * 0.19, Math.cos((i * Math.PI) / 2) * 0.19, 0.055]} geometry={sphere(0.02, 8)}>
            <meshBasicMaterial color={PAL.ink} />
          </mesh>
        ))}
        <group ref={hour} position={[0, 0, 0.06]}>
          <Toon geo={rbox(0.035, 0.13, 0.02, 0.01)} color={PAL.ink} outline={0} position={[0, 0.06, 0]} />
        </group>
        <group ref={minute} position={[0, 0, 0.075]}>
          <Toon geo={rbox(0.025, 0.19, 0.02, 0.01)} color={PAL.coral} outline={0} position={[0, 0.09, 0]} />
        </group>
        <mesh position={[0, 0, 0.09]} geometry={sphere(0.03, 10)}>
          <meshBasicMaterial color={PAL.ink} />
        </mesh>
      </group>
    </group>
  );
}

function Flag({ animate, seed }: { animate: boolean; seed: number }) {
  const flag = useRef<THREE.Group>(null);
  useFrame((st) => {
    if (!flag.current) return;
    const t = animate ? st.clock.elapsedTime + seed : 0;
    flag.current.rotation.y = Math.sin(t * 3) * 0.28;
  });
  return (
    <group position={[2.6, 0.09, -1.05]}>
      <Toon geo={cyl(0.025, 0.025, 1.0)} color={PAL.ink} outline={0.012} position={[0, 0.5, 0]} />
      <group ref={flag} position={[0, 0.88, 0]}>
        <Toon geo={rbox(0.55, 0.3, 0.02, 0.02)} color={PAL.blue} outline={0.014} position={[0.28, 0, 0]} />
        <mesh position={[0.28, 0, 0.016]} geometry={sphere(0.05, 10)}>
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      <Toon geo={sphere(0.045, 10)} color={PAL.lime} outline={0.012} position={[0, 1.02, 0]} />
    </group>
  );
}

function Cone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Toon geo={rbox(0.3, 0.035, 0.3, 0.015)} color="#2d3b34" outline={0.012} position={[0, 0.0175, 0]} />
      <Toon geo={cone(0.12, 0.34)} color="#ff7a1a" outline={0.014} position={[0, 0.2, 0]} />
      <mesh position={[0, 0.2, 0]} rotation-x={Math.PI / 2} geometry={torus(0.073, 0.018, 20)}>
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function BlockedSign({ animate, seed }: { animate: boolean; seed: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((st) => {
    if (!g.current) return;
    const t = animate ? st.clock.elapsedTime + seed : 0;
    g.current.rotation.z = Math.sin(t * 2.4) * 0.025;
  });
  return (
    <group position={[0, 0.15, 0.1]}>
      {[-0.45, 0.45].map((x) => (
        <Toon key={x} geo={rbox(0.05, 0.3, 0.05, 0.015)} color={PAL.ink} outline={0} position={[x, 0.15, 0]} />
      ))}
      <group ref={g} position={[0, 0.36, 0]}>
        <Toon geo={rbox(1.2, 0.34, 0.05, 0.03)} color="#ffffff" map={hazardTexture()} outline={0.016} />
      </group>
    </group>
  );
}

function Tarp() {
  return (
    <group position={[0, 0.2, 0]}>
      <Toon geo={rbox(4.7, 0.14, 2.25, 0.07)} color="#aab6b0" outline={0.02} />
      {[-1.4, 0.2, 1.5].map((x, i) => (
        <mesh key={x} geometry={sphere(0.45, 16)} position={[x, 0.07, (i - 1) * 0.35]} scale={[1.4, 0.28, 0.9]}>
          <meshToonMaterial color="#b9c4be" gradientMap={toonGradient()} />
        </mesh>
      ))}
      {/* padlock */}
      <group position={[0, 0.22, 0.95]}>
        <Toon geo={rbox(0.26, 0.2, 0.1, 0.04)} color={PAL.amber} outline={0.014} position={[0, 0.0, 0]} />
        <mesh position={[0, 0.14, 0]} geometry={torus(0.08, 0.02, 16)}>
          <meshToonMaterial color="#6b7a72" gradientMap={toonGradient()} />
        </mesh>
        <mesh position={[0, -0.005, 0.055]} geometry={sphere(0.025, 8)}>
          <meshBasicMaterial color={PAL.ink} />
        </mesh>
      </group>
    </group>
  );
}

function Pedestal({ show, animate }: { show: boolean; animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((st, dt) => {
    if (!g.current) return;
    const k = animate ? 1 - Math.exp(-10 * dt) : 1;
    const target = show ? 1 : 0;
    const s = g.current.scale.x + (target - g.current.scale.x) * k;
    const pulse = show && animate ? 1 + Math.sin(st.clock.elapsedTime * 3) * 0.012 : 1;
    g.current.scale.set(s * pulse, 1, s * pulse);
    g.current.visible = s > 0.02;
  });
  return (
    <group ref={g} position={[0, -0.075, 0]} scale={[0, 1, 0]}>
      <Toon geo={rbox(6.55, 0.08, 3.55, 0.12)} color={PAL.lime} outline={0.025} />
    </group>
  );
}

// ── Court ────────────────────────────────────────────────────────────────────
export interface CourtProps {
  name: string;
  state: CourtVisualState;
  position: [number, number, number];
  selected: boolean;
  animate: boolean;
  seed: number;
  interactive: boolean;
  onSelect?: () => void;
}

const LINE_Y = 0.152;

function CourtImpl({ name, state, position, selected, animate, seed, interactive, onSelect }: CourtProps) {
  const root = useRef<THREE.Group>(null);
  const hover = useRef(false);
  const apron = useRef<THREE.MeshToonMaterial>(null);
  const court = useRef<THREE.MeshToonMaterial>(null);
  const kitchen = useRef<THREE.MeshToonMaterial>(null);
  const rally = useRef<RallyState>({ u: 0, fromLeft: true, zStart: 0, zEnd: 0 });
  const init = STATE_COLORS[state];

  useFrame((st, dt) => {
    const g = root.current;
    if (!g) return;
    const k = animate ? 1 - Math.exp(-9 * dt) : 1;
    const targetY = (selected ? 0.3 : 0) + (hover.current && interactive ? 0.1 : 0);
    g.position.y += (targetY - g.position.y) * k;
    const ts = selected ? 1.035 : 1;
    g.scale.setScalar(g.scale.x + (ts - g.scale.x) * k);
    const wob = animate && selected ? Math.sin(st.clock.elapsedTime * 1.6 + seed) * 0.018 : 0;
    g.rotation.y += (wob - g.rotation.y) * k;

    const cols = STATE_COLORS[state];
    const ck = animate ? 1 - Math.exp(-6 * dt) : 1;
    if (apron.current) apron.current.color.lerp(_c.set(cols.apron), ck);
    if (court.current) court.current.color.lerp(_c.set(cols.court), ck);
    if (kitchen.current) kitchen.current.color.lerp(_c.set(cols.kitchen), ck);
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    onSelect?.();
  };

  return (
    <group position={position}>
      {/* soft ground shadow */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.09, 0]} geometry={plane(7.6, 4.4)}>
        <meshBasicMaterial map={blobShadowTexture()} transparent depthWrite={false} />
      </mesh>

      <group
        ref={root}
        onClick={handleClick}
        onPointerOver={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          hover.current = true;
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          hover.current = false;
          document.body.style.cursor = '';
        }}
      >
        <Pedestal show={selected} animate={animate} />

        {/* apron / base slab */}
        <Toon geo={rbox(6.0, 0.18, 3.0, 0.08)} color={init.apron} matRef={apron} outline={0.03} />
        {/* playing surface + kitchen */}
        <Toon geo={rbox(4.4, 0.045, 2.0, 0.015)} color={init.court} matRef={court} outline={0} position={[0, 0.11, 0]} />
        <Toon geo={rbox(1.4, 0.05, 2.0, 0.015)} color={init.kitchen} matRef={kitchen} outline={0} position={[0, 0.115, 0]} />

        {/* painted lines */}
        {(
          [
            [[-2.2, LINE_Y, 0], [0.04, 0.012, 2.04]],
            [[2.2, LINE_Y, 0], [0.04, 0.012, 2.04]],
            [[0, LINE_Y, -1.0], [4.44, 0.012, 0.04]],
            [[0, LINE_Y, 1.0], [4.44, 0.012, 0.04]],
            [[-0.7, LINE_Y, 0], [0.035, 0.012, 2.0]],
            [[0.7, LINE_Y, 0], [0.035, 0.012, 2.0]],
            [[1.45, LINE_Y, 0], [1.5, 0.012, 0.035]],
            [[-1.45, LINE_Y, 0], [1.5, 0.012, 0.035]],
          ] as [[number, number, number], [number, number, number]][]
        ).map(([p, s], i) => (
          <mesh key={i} position={p}>
            <boxGeometry args={s} />
            <meshBasicMaterial color={PAL.line} />
          </mesh>
        ))}

        {/* net */}
        {[-1.12, 1.12].map((z) => (
          <Toon key={z} geo={rbox(0.08, 0.46, 0.08, 0.03)} color={PAL.post} outline={0.014} position={[0, 0.32, z]} />
        ))}
        <mesh position={[0, 0.34, 0]} rotation-y={Math.PI / 2} geometry={plane(2.2, 0.3)}>
          <meshBasicMaterial map={netTexture()} transparent side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <Toon geo={rbox(0.035, 0.05, 2.2, 0.015)} color="#ffffff" outline={0.012} position={[0, 0.49, 0]} />

        {/* state-driven props */}
        {state === 'AVAILABLE' && <Beacon animate={animate} seed={seed} />}

        {state === 'USING' && (
          <>
            <Rally animate={animate} seed={seed} rally={rally} />
            <Player position={[-1.55, 0.14, -0.55]} face={1} idx={0} side={0} look={seed % 4} animate={animate} rally={rally} />
            <Player position={[-1.55, 0.14, 0.55]} face={1} idx={1} side={0} look={(seed + 1) % 4} animate={animate} rally={rally} />
            <Player position={[1.55, 0.14, -0.55]} face={-1} idx={0} side={1} look={(seed + 2) % 4} animate={animate} rally={rally} />
            <Player position={[1.55, 0.14, 0.55]} face={-1} idx={1} side={1} look={(seed + 3) % 4} animate={animate} rally={rally} />
          </>
        )}

        {state === 'RESERVED' && <HeldClock animate={animate} seed={seed} />}

        {state === 'BOOKED' && (
          <>
            <Flag animate={animate} seed={seed} />
            <Player position={[-1.45, 0.14, -0.4]} face={1} idx={0} side={0} look={seed % 4} animate={animate} />
            <Player position={[-1.45, 0.14, 0.45]} face={1} idx={1} side={0} look={(seed + 1) % 4} animate={animate} />
            <group position={[0.2, 0.2, 0.0]}>
              <Ball r={0.08} />
            </group>
          </>
        )}

        {state === 'BLOCKED' && (
          <>
            <Cone position={[-1.95, 0.09, -0.8]} />
            <Cone position={[-1.95, 0.09, 0.8]} />
            <Cone position={[1.95, 0.09, -0.8]} />
            <Cone position={[1.95, 0.09, 0.8]} />
            <BlockedSign animate={animate} seed={seed} />
          </>
        )}

        {state === 'CLOSED' && <Tarp />}

        {/* court name painted on the front apron */}
        <mesh position={[0, 0.095, 1.26]} rotation-x={-Math.PI / 2} geometry={plane(2.2, 0.55)}>
          <meshBasicMaterial map={labelTexture(name)} transparent depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

export default memo(CourtImpl);
