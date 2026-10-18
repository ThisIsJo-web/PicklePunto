'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Court from './Court';
import type { StageCourt, CourtVisualState } from './types';
import { STATE_LABEL } from './types';
import SoundToggle from '@/components/sfx/SoundToggle';
import { useSfx } from '@/components/sfx/SfxProvider';
import styles from './CourtStage.module.css';

/* ─────────────────────────────────────────────────────────────────────────────
   Camera & Controls Manager
   Smoothly lerps the camera & lookAt target when selected court or mode changes.
───────────────────────────────────────────────────────────────────────────── */
interface CameraProps {
  targetPos: [number, number, number];
  viewMode: 'focus' | 'arena';
  animate: boolean;
}

function CameraRig({ targetPos, viewMode }: CameraProps) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const lookTarget = useRef(new THREE.Vector3(...targetPos));
  const desiredCam = useRef(new THREE.Vector3());

  // Set up OrbitControls on canvas DOM element
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.15; // Don't go below floor
    controls.minDistance = 4;
    controls.maxDistance = 34;
    controls.target.copy(lookTarget.current);
    controlsRef.current = controls;

    return () => {
      controls.dispose();
    };
  }, [camera, gl]);

  // Compute desired camera offset depending on viewMode
  useEffect(() => {
    const [tx, ty, tz] = targetPos;
    lookTarget.current.set(tx, ty, tz);

    if (viewMode === 'focus') {
      // Intimate isometric court angle
      desiredCam.current.set(tx + 4.8, ty + 4.8, tz + 6.2);
    } else {
      // High-angle arena overview
      desiredCam.current.set(tx + 9.5, ty + 12.0, tz + 14.0);
    }
  }, [targetPos, viewMode]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-6 * dt);
    // Smoothly fly camera to desired point
    camera.position.lerp(desiredCam.current, k);

    if (controlsRef.current) {
      controlsRef.current.target.lerp(lookTarget.current, k);
      controlsRef.current.update();
    }
  });

  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main 3D Court Stage
───────────────────────────────────────────────────────────────────────────── */
export interface CourtStageProps {
  courts: StageCourt[];
  selectedCourtId?: string;
  onSelectCourt?: (id: string) => void;
  title?: string;
  subtitle?: string;
  className?: string;
  initialMode?: 'focus' | 'arena';
  height?: number | string;
}

const DEFAULT_COURTS: StageCourt[] = [
  { id: 'c1', name: 'Court 1', state: 'USING', caption: 'In Session' },
  { id: 'c2', name: 'Court 2', state: 'AVAILABLE', caption: 'Available' },
  { id: 'c3', name: 'Court 3', state: 'RESERVED', caption: 'Held' },
  { id: 'c4', name: 'Court 4', state: 'BOOKED', caption: 'Booked' },
];

export default function CourtStage({
  courts = DEFAULT_COURTS,
  selectedCourtId,
  onSelectCourt,
  title = 'Pickleball Arena (Live 3D)',
  subtitle = 'Actual 3D cartoon courts syncing real-time availability',
  className = '',
  initialMode = 'focus',
  height,
}: CourtStageProps) {
  const { play } = useSfx();
  const [mounted, setMounted] = useState(false);
  const [animate, setAnimate] = useState(true);
  const [viewMode, setViewMode] = useState<'focus' | 'arena'>(initialMode);
  const [activeId, setActiveId] = useState<string>(() => {
    return selectedCourtId || (courts.length > 0 ? courts[0].id : 'c1');
  });

  // Sync internal activeId with controlled selectedCourtId prop
  useEffect(() => {
    if (selectedCourtId && selectedCourtId !== activeId) {
      setActiveId(selectedCourtId);
    }
  }, [selectedCourtId, activeId]);

  useEffect(() => {
    setMounted(true);
    // Check if user prefers reduced motion
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setAnimate(false);
    }
  }, []);

  // Compute 3D positions for each court in a spaced 2x2 or linear configuration
  // Spacing: x: 7.6 units, z: 4.8 units
  const courtPositions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    const count = courts.length;

    courts.forEach((c, idx) => {
      let x = 0;
      let z = 0;
      if (count <= 2) {
        x = (idx - (count - 1) / 2) * 7.4;
        z = 0;
      } else if (count <= 4) {
        // 2x2 layout
        const col = idx % 2; // 0 or 1
        const row = Math.floor(idx / 2); // 0 or 1
        x = (col - 0.5) * 7.5;
        z = (row - 0.5) * 4.6;
      } else {
        // Linear row
        x = (idx - (count - 1) / 2) * 7.6;
        z = 0;
      }
      map.set(c.id, [x, 0, z]);
    });
    return map;
  }, [courts]);

  // Target camera focus point
  const currentTargetPos: [number, number, number] = useMemo(() => {
    if (viewMode === 'arena') {
      return [0, 0, 0];
    }
    return courtPositions.get(activeId) || [0, 0, 0];
  }, [viewMode, activeId, courtPositions]);

  const handleSelect = (courtId: string) => {
    play('select');
    setActiveId(courtId);
    if (viewMode === 'arena') {
      setViewMode('focus');
    }
    onSelectCourt?.(courtId);
  };

  return (
    <div className={`${styles.stageWrapper} ${className}`}>
      {/* Top Header Bar */}
      <div className={styles.topBar}>
        <div className={styles.titleArea}>
          <div className={styles.badge3D}>
            <span>🏟️</span>
            <span>3D Court View</span>
          </div>
          <div>
            <h3 className={styles.stageTitle}>{title}</h3>
            {subtitle && <p className={styles.stageSubtitle}>{subtitle}</p>}
          </div>
        </div>

        <div className={styles.controlsArea}>
          {/* Mode Switcher: Focus vs Arena */}
          <button
            type="button"
            className={`${styles.pillBtn} ${viewMode === 'focus' ? styles.pillBtnActive : ''}`}
            onClick={() => {
              play('tap');
              setViewMode('focus');
            }}
            title="Focus on selected court"
          >
            <span>🎯</span>
            <span>Focus</span>
          </button>
          <button
            type="button"
            className={`${styles.pillBtn} ${viewMode === 'arena' ? styles.pillBtnActive : ''}`}
            onClick={() => {
              play('tap');
              setViewMode('arena');
            }}
            title="View entire facility"
          >
            <span>🌐</span>
            <span>All Courts</span>
          </button>

          {/* Animate play/pause */}
          <button
            type="button"
            className={styles.pillBtn}
            onClick={() => {
              play('tap');
              setAnimate((prev) => !prev);
            }}
            aria-pressed={animate}
            title={animate ? 'Pause 3D rally animation' : 'Resume 3D animation'}
          >
            <span>{animate ? '⏸️' : '▶️'}</span>
          </button>

          {/* Global Sound Toggle */}
          <SoundToggle />
        </div>
      </div>

      {/* 3D Canvas Container */}
      <div className={styles.canvasContainer} style={height ? { height } : undefined}>
        {!mounted ? (
          <div className={styles.fallbackContainer}>
            <span className={styles.bouncingBall}>🏓</span>
            <span>Loading 3D Cartoon Arena...</span>
          </div>
        ) : (
          <Canvas
            dpr={[1, 1.75]}
            camera={{ position: [10, 11, 14], fov: 38, near: 0.1, far: 80 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          >
            {/* Soft Warm Sunshine & Ambience */}
            <ambientLight intensity={1.05} />
            <hemisphereLight args={['#ffffff', '#c5e8d2', 0.65]} />
            <directionalLight
              position={[12, 18, 10]}
              intensity={1.35}
              color="#fff8ea"
              castShadow={false}
            />
            <directionalLight
              position={[-10, 12, -8]}
              intensity={0.5}
              color="#8ad3a6"
            />

            {/* Camera manager */}
            <CameraRig
              targetPos={currentTargetPos}
              viewMode={viewMode}
              animate={animate}
            />

            {/* Render all courts in facility */}
            {courts.map((court, index) => {
              const pos = courtPositions.get(court.id) || [0, 0, 0];
              const isSelected = court.id === activeId;

              return (
                <Court
                  key={court.id}
                  name={court.name}
                  state={court.state}
                  position={pos}
                  selected={isSelected}
                  animate={animate}
                  seed={index + 1}
                  interactive={true}
                  onSelect={() => handleSelect(court.id)}
                />
              );
            })}
          </Canvas>
        )}

        <div className={styles.dragHint}>
          <span>👆</span>
          <span>Drag to orbit · Pinch to zoom · Tap court to inspect</span>
        </div>
      </div>

      {/* Court Quick Switcher Chips */}
      <div className={styles.courtChipsRow} role="tablist" aria-label="Courts switcher">
        {courts.map((court) => {
          const isSelected = court.id === activeId;
          const label = STATE_LABEL[court.state as CourtVisualState] || court.state;

          return (
            <button
              key={court.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`${styles.courtChip} ${isSelected ? styles.courtChipSelected : ''}`}
              onClick={() => handleSelect(court.id)}
            >
              <span className={styles.chipStateDot} data-state={court.state} />
              <span>{court.name}</span>
              <span style={{ opacity: 0.85, fontSize: '0.7rem' }}>
                ({label})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
