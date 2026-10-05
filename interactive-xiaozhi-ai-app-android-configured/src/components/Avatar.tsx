import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { colors, eyeColors } from '../data';
import WorldObjects from './WorldObjects';
import type { Activity, Emotion, Gesture, HomeSettings, Profile } from '../types';

interface AvatarProps {
  emotion: Emotion;
  gesture: Gesture;
  color: Profile['color'];
  speaking: boolean;
  onInteract: () => void;
  reducedMotion: boolean;
  profile: Profile;
  home: HomeSettings;
  activity: Activity;
  destination: number;
  onActivity: (activity: Activity, destination?: number) => void;
  onComputer: () => void;
}

function Curve({ points, color = '#def3c1', radius = 0.018 }: {
  points: [number, number, number][]; color?: string; radius?: number;
}) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return new THREE.TubeGeometry(curve, 24, radius, 8, false);
  }, [points, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} roughness={0.3} /></mesh>;
}

function Arm({ side, palette }: { side: -1 | 1; palette: typeof colors.sage }) {
  return <>
    <mesh position={[0, -0.26, 0]} castShadow><capsuleGeometry args={[0.185, 0.29, 8, 24]} /><meshStandardMaterial color={palette.main} roughness={0.68} /></mesh>
    <mesh position={[0, -0.52, 0]}><cylinderGeometry args={[0.166, 0.166, 0.13, 24]} /><meshStandardMaterial color={palette.dark} roughness={0.85} /></mesh>
    <mesh position={[0, -0.7, 0.02]} scale={[0.165, 0.21, 0.155]} castShadow><sphereGeometry args={[1, 24, 16]} /><meshPhysicalMaterial color="#f5f1e7" roughness={0.3} clearcoat={0.4} /></mesh>
    <mesh position={[-side * 0.13, -0.64, 0.10]} rotation={[0, 0, side * 0.6]} scale={[0.073, 0.13, 0.085]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#f5f1e7" roughness={0.35} /></mesh>
  </>;
}

function Robot({ emotion, gesture, color, speaking, onInteract, reducedMotion, profile, activity, destination }: AvatarProps) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const antenna = useRef<THREE.Group>(null);
  const eyeLeft = useRef<THREE.Mesh>(null);
  const eyeRight = useRef<THREE.Mesh>(null);
  const smile = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const blink = useRef({ next: 3, started: -10, closed: 1 });
  const weights = useRef({ wave: 0, dance: 0, hug: 0, breathe: 0, action: 0, walking: 0, speech: 0 });
  const palette = colors[color];
  const smilePoints = useMemo<[number, number, number][]>(() => [[-0.145, 0, 0], [0, -0.065, 0.01], [0.145, 0, 0]], []);
  const eyeTint = eyeColors[profile.eyeColor];
  const roughness = profile.finish === 'clay' ? 0.95 : profile.finish === 'chrome' ? 0.18 : 0.38;

  useFrame(({ pointer }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.04);
    clock.current += delta * profile.motionSpeed;
    const time = clock.current;
    const damp = (a: number, b: number, smoothing = 5) => reducedMotion ? b : THREE.MathUtils.damp(a, b, smoothing, delta);
    const movement = reducedMotion ? 0 : 1;
    const w = weights.current;
    for (const key of ['wave', 'dance', 'hug', 'breathe'] as const) w[key] = damp(w[key], gesture === key && activity === 'idle' ? 1 : 0);
    w.speech = damp(w.speech, speaking ? 1 : 0, 8);
    const distance = Math.abs((root.current?.position.x ?? 0) - destination);
    w.walking = damp(w.walking, distance > 0.065 ? Math.min(1, distance * 3) : 0, 4);
    w.action = damp(w.action, activity !== 'idle' && distance < 0.12 ? 1 : 0, 3);
    const reading = activity === 'read' ? w.action : 0;
    const resting = activity === 'rest' ? w.action : 0;
    const typing = activity === 'computer' ? w.action : 0;
    const watering = activity === 'water' ? w.action : 0;
    const tea = activity === 'tea' ? w.action : 0;
    const gait = Math.sin(time * 6.4) * w.walking * movement;
    if (root.current) {
      root.current.position.x = damp(root.current.position.x, destination, 2.2);
      root.current.position.z = damp(root.current.position.z, reading || resting ? -0.65 : typing ? -0.1 : 0, 2.2);
      root.current.position.y = damp(root.current.position.y, (Math.sin(time * 1.45) * 0.015 + w.dance * (0.055 + Math.sin(time * 5) * 0.055) + Math.abs(gait) * 0.045) * movement - (reading + resting) * 0.075, 10);
      root.current.rotation.z = damp(root.current.rotation.z, (Math.sin(time * 0.75) * 0.015 + w.dance * Math.sin(time * 5) * 0.13 + gait * 0.045) * movement);
      const walkTurn = Math.sign(destination - root.current.position.x) * 0.8 * w.walking;
      root.current.rotation.y = damp(root.current.rotation.y, walkTurn + (1 - w.walking) * (-0.10 + pointer.x * 0.04 + w.dance * Math.sin(time * 2.5) * 0.3 - watering * 0.65 + typing * 0.9), 3.5);
      root.current.rotation.x = damp(root.current.rotation.x, watering * 0.1 - resting * 0.08);
      const breath = 1 + (Math.sin(time * 1.45) * 0.003 + w.breathe * Math.sin(time * 0.78) * 0.022) * movement;
      root.current.scale.setScalar(damp(root.current.scale.x, 0.88 * profile.size * breath, 3));
    }
    if (head.current) {
      head.current.rotation.z = damp(head.current.rotation.z, w.wave * 0.1 + (emotion === 'curious' ? -0.08 : 0) + Math.sin(time * 0.7) * 0.02 * movement - resting * 0.13, 3.5);
      head.current.rotation.y = damp(head.current.rotation.y, pointer.x * 0.09 * (1 - w.action * typing) + Math.sin(time * 0.4) * 0.045 * movement);
      head.current.rotation.x = damp(head.current.rotation.x, -pointer.y * 0.04 + (emotion === 'sad' ? 0.09 : 0) + reading * 0.23 + watering * 0.13 + typing * 0.06 - tea * 0.07 + w.speech * Math.sin(time * 2.8) * 0.025);
    }
    if (leftArm.current && rightArm.current) {
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, -0.16 + w.wave * (-2.15 + Math.sin(time * 6.4) * 0.25 * movement) + w.dance * (-0.95 + Math.sin(time * 5) * 0.4 * movement) - w.hug * 0.45 - watering * 0.72 + reading * 0.25);
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, 0.16 + w.dance * (0.95 + Math.cos(time * 5) * 0.4 * movement) + w.hug * 0.45 - reading * 0.25 - tea * 0.20);
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, -w.hug * 1.35 + gait * 0.45 - reading * 0.85 - watering * 0.45 - typing * (1.02 + Math.sin(time * 8) * 0.065 * movement));
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, -w.hug * 1.35 - gait * 0.45 - reading * 0.85 - tea * (1.55 + Math.sin(time * 0.7) * 0.18 * movement) - typing * (1.02 + Math.cos(time * 8) * 0.065 * movement));
    }
    if (eyes.current) {
      const b = blink.current;
      if (time > b.next) { b.started = time; b.next = time + 3.2 + Math.random() * 3.2; }
      const progress = (time - b.started) / 0.24;
      const closure = progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) ** 2 : 0;
      eyes.current.scale.y = damp(eyes.current.scale.y, resting ? 0.12 : 1 - closure * 0.94 * movement, 42);
    }
    [eyeLeft.current, eyeRight.current].forEach((eye, index) => {
      if (!eye) return;
      const height = emotion === 'calm' || emotion === 'love' ? 0.022 : emotion === 'excited' ? 0.14 : emotion === 'curious' && index === 0 ? 0.072 : 0.108;
      eye.scale.y = damp(eye.scale.y, height, 5);
      eye.rotation.z = damp(eye.rotation.z, emotion === 'sad' ? (index ? -0.18 : 0.18) : 0);
    });
    if (mouth.current) mouth.current.scale.y = damp(mouth.current.scale.y, 1 + w.speech * (0.5 + Math.sin(time * 13) * 0.35) * movement, 14);
    if (smile.current) smile.current.scale.y = damp(smile.current.scale.y, emotion === 'sad' ? -0.55 : emotion === 'excited' ? 1.6 : 1, 5);
    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = damp(leftLeg.current.rotation.x, -gait * 0.38 - (reading + resting) * 1.0, 10);
      rightLeg.current.rotation.x = damp(rightLeg.current.rotation.x, gait * 0.38 - (reading + resting) * 1.0, 10);
      leftLeg.current.position.y = damp(leftLeg.current.position.y, 0.75 + Math.max(0, Math.sin(time * 5)) * 0.08 * w.dance * movement, 10);
      rightLeg.current.position.y = damp(rightLeg.current.position.y, 0.75 + Math.max(0, -Math.sin(time * 5)) * 0.08 * w.dance * movement, 10);
    }
    if (antenna.current) antenna.current.rotation.z = damp(antenna.current.rotation.z, Math.sin(time * 1.2) * 0.055 * movement - root.current!.rotation.z * 0.5, 2.8);
  });

  return (
    <group ref={root} scale={0.88} onClick={(event) => { event.stopPropagation(); onInteract(); }} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
      <group ref={leftLeg} position={[0, 0.75, 0]}><group position={[0, -0.75, 0]}>
        <mesh position={[-0.27, 0.52, 0]} castShadow>
          <capsuleGeometry args={[0.185, 0.39, 8, 24]} />
          <meshStandardMaterial color="#f0ede2" roughness={0.5} />
        </mesh>
        <RoundedBox args={[0.46, 0.31, 0.65]} radius={0.14} smoothness={5} position={[-0.27, 0.2, 0.1]} castShadow><meshPhysicalMaterial color="#f6f4ec" roughness={0.4} clearcoat={0.25} /></RoundedBox>
        <RoundedBox args={[0.46, 0.08, 0.64]} radius={0.035} smoothness={3} position={[-0.27, 0.085, 0.1]}><meshStandardMaterial color={palette.dark} roughness={0.8} /></RoundedBox>
      </group></group>
      <group ref={rightLeg} position={[0, 0.75, 0]}><group position={[0, -0.75, 0]}>
        <mesh position={[0.27, 0.52, 0]} castShadow>
          <capsuleGeometry args={[0.185, 0.39, 8, 24]} />
          <meshStandardMaterial color="#f0ede2" roughness={0.5} />
        </mesh>
        <RoundedBox args={[0.46, 0.31, 0.65]} radius={0.14} smoothness={5} position={[0.27, 0.2, 0.1]} castShadow><meshPhysicalMaterial color="#f6f4ec" roughness={0.4} clearcoat={0.25} /></RoundedBox>
        <RoundedBox args={[0.46, 0.08, 0.64]} radius={0.035} smoothness={3} position={[0.27, 0.085, 0.1]}><meshStandardMaterial color={palette.dark} roughness={0.8} /></RoundedBox>
      </group></group>
      <RoundedBox args={[1.06, 1.11, 0.8]} radius={0.3} smoothness={4} position={[0, 1.37, 0]} castShadow><meshStandardMaterial color={palette.main} roughness={roughness} metalness={profile.finish === 'chrome' ? 0.55 : 0} /></RoundedBox>
      <mesh position={[0, 1.87, -0.11]} scale={[0.49, 0.22, 0.39]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color={palette.dark} roughness={0.8} /></mesh>
      <mesh position={[0, 2.03, 0]}><cylinderGeometry args={[0.22, 0.23, 0.2, 32]} /><meshPhysicalMaterial color="#e6e6d8" roughness={0.3} metalness={0.1} /></mesh>
      <RoundedBox args={[0.53, 0.27, 0.25]} radius={0.11} smoothness={4} position={[0, 1.11, 0.30]}><meshStandardMaterial color={palette.light} roughness={0.9} /></RoundedBox>
      <mesh position={[0, 1.57, 0.424]}><circleGeometry args={[0.115, 32]} /><meshStandardMaterial color="#f2f3e7" roughness={0.8} /></mesh>
      <mesh position={[-0.027, 1.584, 0.427]} rotation={[0, 0, -0.6]} scale={[0.026, 0.045, 0.012]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={palette.dark} /></mesh>
      <mesh position={[0.027, 1.584, 0.427]} rotation={[0, 0, 0.6]} scale={[0.026, 0.045, 0.012]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={palette.dark} /></mesh>
      {profile.accessory === 'scarf' && <group><mesh position={[0, 1.99, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.32, 0.08, 12, 32]} /><meshStandardMaterial color="#ce997e" roughness={1} /></mesh><RoundedBox args={[0.19, 0.46, 0.075]} radius={0.035} position={[0.23, 1.73, 0.42]} rotation={[0.1, 0, -0.1]}><meshStandardMaterial color="#ce997e" roughness={1} /></RoundedBox></group>}
      {activity === 'read' && <group position={[0, 1.23, 0.67]} rotation={[0.55, 0, 0]}><RoundedBox args={[0.81, 0.07, 0.5]} radius={0.025}><meshStandardMaterial color="#8c9f73" /></RoundedBox><mesh position={[0, 0.05, 0]}><boxGeometry args={[0.74, 0.05, 0.44]} /><meshStandardMaterial color="#f1e8d0" /></mesh></group>}
      <group ref={leftArm} position={[-0.66, 1.78, 0]}><Arm side={-1} palette={palette} />{activity === 'water' && <group position={[0, -0.84, 0.05]} rotation={[0, 0, 0.5]}><mesh><cylinderGeometry args={[0.16, 0.17, 0.26, 20]} /><meshStandardMaterial color="#b8c3a4" /></mesh><mesh position={[-0.24, 0.04, 0]} rotation={[0, 0, 1.15]}><cylinderGeometry args={[0.045, 0.07, 0.34, 12]} /><meshStandardMaterial color="#b8c3a4" /></mesh><mesh position={[0.15, 0.10, 0]}><torusGeometry args={[0.1, 0.02, 8, 20]} /><meshStandardMaterial color="#b8c3a4" /></mesh></group>}</group>
      <group ref={rightArm} position={[0.66, 1.78, 0]}><Arm side={1} palette={palette} />{activity === 'tea' && <group position={[0, -0.77, 0.15]} rotation={[1.2, 0, 0]}><mesh><cylinderGeometry args={[0.11, 0.085, 0.22, 24]} /><meshStandardMaterial color="#eee5cb" /></mesh><mesh position={[0.12, 0, 0]}><torusGeometry args={[0.07, 0.022, 8, 20]} /><meshStandardMaterial color="#eee5cb" /></mesh></group>}</group>
      <group ref={head} position={[0, 2.66, 0]}>
        <RoundedBox args={[1.66, 1.29, 1.14]} radius={0.43} smoothness={5} castShadow><meshPhysicalMaterial color="#faf7ed" roughness={roughness} metalness={profile.finish === 'chrome' ? 0.48 : 0} clearcoat={profile.finish === 'clay' ? 0 : 0.6} clearcoatRoughness={0.32} /></RoundedBox>
        {([-1, 1] as const).map((side) => (
          <group key={side} position={[side * 0.83, -0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <mesh castShadow><cylinderGeometry args={[0.23, 0.23, 0.17, 40]} /><meshStandardMaterial color={palette.main} roughness={0.45} /></mesh>
            <mesh position={[0, side * 0.1, 0]}><cylinderGeometry args={[0.13, 0.13, 0.04, 32]} /><meshPhysicalMaterial color={palette.light} roughness={0.35} clearcoat={0.5} /></mesh>
          </group>
        ))}
        <RoundedBox args={[1.36, 0.88, 0.65]} radius={0.30} smoothness={8} position={[0, -0.02, 0.30]}><meshPhysicalMaterial color="#293e33" roughness={0.21} metalness={0.12} clearcoat={1} clearcoatRoughness={0.18} /></RoundedBox>
        <group ref={eyes} position={[0, 0.065, 0]}>
          {[-1, 1].map((side) => <mesh key={side} ref={side === -1 ? eyeLeft : eyeRight} position={[side * 0.28, 0, 0.647]} scale={[0.072, 0.108, 0.022]}><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color={eyeTint} emissive={eyeTint} emissiveIntensity={0.6} roughness={0.3} /></mesh>)}
        </group>
        {[-1, 1].map((side) => <mesh key={side} position={[side * 0.41, -0.12, 0.627]} scale={[0.089, 0.035, 0.011]}><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color={emotion === 'love' ? '#efa5a1' : '#d3b09a'} transparent opacity={0.75} roughness={0.7} /></mesh>)}
        <group ref={mouth} position={[0, -0.16, 0.65]}><group ref={smile}><Curve points={smilePoints} color={eyeTint} /></group></group>
        {profile.accessory === 'glasses' && <group position={[0, 0.04, 0.68]}>{[-1, 1].map((side) => <mesh key={side} position={[side * 0.28, 0, 0]}><torusGeometry args={[0.20, 0.018, 8, 36]} /><meshStandardMaterial color="#b1a081" metalness={0.3} roughness={0.45} /></mesh>)}<mesh><boxGeometry args={[0.15, 0.025, 0.022]} /><meshStandardMaterial color="#b1a081" /></mesh></group>}
        {profile.accessory === 'headphones' && <group>{[-1, 1].map((side) => <RoundedBox key={side} args={[0.18, 0.48, 0.42]} radius={0.08} position={[side * 0.94, -0.02, 0]}><meshStandardMaterial color={palette.dark} roughness={0.6} /></RoundedBox>)}<mesh position={[0, 0.03, 0]}><torusGeometry args={[0.91, 0.04, 10, 48, Math.PI]} /><meshStandardMaterial color={palette.dark} /></mesh></group>}
        <group ref={antenna}>
        <mesh position={[0.04, 0.76, -0.015]} rotation={[0, 0, -0.18]}><cylinderGeometry args={[0.025, 0.03, 0.3, 16]} /><meshStandardMaterial color={palette.dark} roughness={0.55} /></mesh>
        {profile.antenna === 'sprout' ? <><mesh position={[-0.12, 0.855, 0]} rotation={[0.2, 0, -0.4]} scale={[0.205, 0.078, 0.105]} castShadow><sphereGeometry args={[1, 24, 16]} /><meshPhysicalMaterial color={palette.main} roughness={0.5} clearcoat={0.25} /></mesh><mesh position={[0.2, 0.90, 0]} rotation={[-0.1, 0, 0.45]} scale={[0.22, 0.074, 0.103]} castShadow><sphereGeometry args={[1, 24, 16]} /><meshPhysicalMaterial color={palette.dark} roughness={0.5} clearcoat={0.25} /></mesh></> : profile.antenna === 'orb' ? <mesh position={[0.07, 0.96, 0]}><sphereGeometry args={[0.13, 24, 16]} /><meshStandardMaterial color={eyeTint} emissive={eyeTint} emissiveIntensity={0.45} /></mesh> : <mesh position={[0.07, 0.95, 0]} rotation={[0, 0, 0.3]}><octahedronGeometry args={[0.18]} /><meshStandardMaterial color="#d9be7e" metalness={0.25} roughness={0.4} /></mesh>}
        </group>
      </group>
    </group>
  );
}

function AvatarFallback({ onInteract, emotion, gesture, color }: AvatarProps) {
  return <button className={`avatar-fallback gesture-${gesture}`} onClick={onInteract} aria-label="Say hello to your companion">
    <svg viewBox="0 0 240 370" role="img" aria-label={`A little ${emotion} robot`}>
      <defs><linearGradient id="robot-white" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fffef5" /><stop offset="1" stopColor="#d8ddcf" /></linearGradient></defs>
      <ellipse cx="120" cy="351" rx="59" ry="10" fill="#425644" opacity=".13" />
      <g className="fallback-body">
        <rect x="87" y="279" width="27" height="57" rx="14" fill="url(#robot-white)" /><rect x="126" y="279" width="27" height="57" rx="14" fill="url(#robot-white)" />
        <rect x="81" y="321" width="39" height="25" rx="11" fill="#f5f4e9" /><rect x="120" y="321" width="39" height="25" rx="11" fill="#f5f4e9" />
        <rect x="73" y="188" width="94" height="109" rx="32" fill={colors[color].main} />
        <g className="fallback-left-arm"><rect x="44" y="196" width="29" height="74" rx="14" fill={colors[color].main} /><ellipse cx="59" cy="273" rx="14" ry="18" fill="url(#robot-white)" /></g>
        <rect x="167" y="196" width="29" height="74" rx="14" fill={colors[color].main} /><ellipse cx="181" cy="273" rx="14" ry="18" fill="url(#robot-white)" />
        <rect x="97" y="252" width="46" height="23" rx="9" fill={colors[color].light} /><circle cx="120" cy="223" r="10" fill="#f7f8eb" />
        <path d="M120 65V36" stroke={colors[color].dark} strokeWidth="5" /><ellipse cx="103" cy="37" rx="20" ry="8" transform="rotate(25 103 37)" fill={colors[color].main} /><ellipse cx="135" cy="31" rx="20" ry="8" transform="rotate(-25 135 31)" fill={colors[color].dark} />
        <rect x="26" y="98" width="24" height="49" rx="12" fill={colors[color].main} /><rect x="190" y="98" width="24" height="49" rx="12" fill={colors[color].main} />
        <rect x="40" y="61" width="160" height="133" rx="45" fill="url(#robot-white)" /><rect x="56" y="85" width="128" height="88" rx="30" fill="#2d4437" />
        <g stroke="#e3f5c8" strokeWidth="8" strokeLinecap="round"><path d={emotion === 'calm' || emotion === 'love' ? 'M82 118q9 -9 18 0M140 118q9 -9 18 0' : 'M90 112v14M150 112v14'} /><path d="M109 146q11 11 22 0" strokeWidth="4" /></g>
        <ellipse cx="76" cy="140" rx="8" ry="3" fill="#d8b3a0" /><ellipse cx="164" cy="140" rx="8" ry="3" fill="#d8b3a0" />
      </g>
    </svg>
  </button>;
}

class CanvasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function Avatar(props: AvatarProps) {
  const fallback = <AvatarFallback {...props} />;
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => { const update = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  return (
    <CanvasBoundary fallback={fallback}>
      <Canvas frameloop={visible ? 'always' : 'never'} camera={{ position: [0, 3.4, 9.8], fov: 35 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }} fallback={fallback} onCreated={({ camera }) => camera.lookAt(0, 1.55, 0)} onPointerMissed={(event) => { if (event.type === 'click' && event.target instanceof HTMLCanvasElement) props.onActivity('wander', Math.max(-0.85, Math.min(0.85, (event.offsetX / event.target.clientWidth - 0.5) * 2))); }}>
        <ambientLight intensity={props.home.daylight === 'night' ? 0.6 : 1.1} />
        <directionalLight position={[-3, 6, 5]} intensity={props.home.daylight === 'night' ? 1.1 : 2.7} color={props.home.daylight === 'golden' ? '#ffcd91' : props.home.daylight === 'night' ? '#c3d6fa' : '#fff5dc'} />
        <directionalLight position={[4, 2, 2]} intensity={1.1} color="#d9ead1" />
        <Suspense fallback={null}>
          <Environment resolution={128}>
            <Lightformer intensity={2} position={[-3, 5, 3]} scale={[5, 5, 1]} rotation={[0, 0.4, 0]} />
            <Lightformer intensity={0.7} position={[4, 2, 2]} scale={[3, 5, 1]} rotation={[0, -0.8, 0]} />
          </Environment>
          <WorldObjects home={props.home} activity={props.activity} reducedMotion={props.reducedMotion} onActivity={props.onActivity} onComputer={props.onComputer} />
          <Robot {...props} />
          <ContactShadows position={[0, 0.015, 0]} opacity={0.3} scale={7} blur={2.5} far={4} color="#435039" resolution={128} />
        </Suspense>
      </Canvas>
    </CanvasBoundary>
  );
}