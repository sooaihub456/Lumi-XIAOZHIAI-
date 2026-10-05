import { useEffect, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { decorColors } from '../data';
import type { Activity, HomeSettings } from '../types';

interface Props {
  home: HomeSettings;
  activity: Activity;
  reducedMotion: boolean;
  onActivity: (activity: Activity) => void;
  onComputer: () => void;
}

export default function WorldObjects({ home, activity, reducedMotion, onActivity, onComputer }: Props) {
  const plant = useRef<THREE.Group>(null);
  const steam = useRef<THREE.Group>(null);
  const droplets = useRef<THREE.Group>(null);
  const wateringTime = useRef(0);
  useEffect(() => { wateringTime.current = 0; }, [activity]);
  const wood = decorColors[home.decor];
  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.04);
    const time = clock.elapsedTime;
    wateringTime.current += delta;
    if (plant.current) {
      plant.current.rotation.z = THREE.MathUtils.damp(plant.current.rotation.z, reducedMotion ? 0 : Math.sin(time * 0.8) * 0.035, 3, delta);
      plant.current.scale.y = THREE.MathUtils.damp(plant.current.scale.y, 0.8 + home.plantGrowth * 0.065, 1.5, delta);
    }
    if (steam.current) steam.current.children.forEach((puff, index) => {
      puff.position.y = 0.3 + ((time * 0.15 + index * 0.14) % 0.6);
      puff.position.x = Math.sin(time * 1.1 + index) * 0.025;
    });
    if (droplets.current) {
      droplets.current.visible = activity === 'water' && wateringTime.current > 2.1;
      droplets.current.children.forEach((drop, index) => {
        const progress = (time * 0.9 + index * 0.12) % 1;
        drop.position.set(-1.72 + Math.sin(index * 3) * 0.055, 1.24 - progress * 0.67, 0.05 + Math.cos(index * 2) * 0.07);
        drop.scale.y = 1.4 + progress;
      });
    }
  });
  const click = (callback: () => void) => (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); callback(); };
  const hover = () => { document.body.style.cursor = 'pointer'; };
  const leave = () => { document.body.style.cursor = ''; };

  return <group>
    {!reducedMotion && <group ref={droplets} visible={false}>{Array.from({ length: 8 }, (_, index) => <mesh key={index}><sphereGeometry args={[0.014, 8, 8]} /><meshStandardMaterial color="#b8d7de" transparent opacity={0.68} roughness={0.2} /></mesh>)}</group>}
    <group position={[1.3, 0, -0.48]} rotation={[0, -0.24, 0]} onClick={click(onComputer)} onPointerOver={hover} onPointerOut={leave}>
      <RoundedBox args={[1.42, 0.12, 0.9]} radius={0.05} position={[0, 1.22, 0]}><meshStandardMaterial color={wood} roughness={0.8} /></RoundedBox>
      {[-0.56, 0.56].map((x) => <mesh key={x} position={[x, 0.61, 0]}><boxGeometry args={[0.075, 1.17, 0.65]} /><meshStandardMaterial color={wood} /></mesh>)}
      <RoundedBox args={[1.14, 0.82, 0.095]} radius={0.075} smoothness={3} position={[0, 1.86, -0.1]}><meshStandardMaterial color="#d9dfd1" roughness={0.3} metalness={0.25} /></RoundedBox>
      <mesh position={[0, 1.89, -0.044]}><planeGeometry args={[0.99, 0.65]} /><meshStandardMaterial color={activity === 'computer' ? '#9bb8a2' : '#365044'} emissive={activity === 'computer' ? '#a8ceb6' : '#547966'} emissiveIntensity={0.35} roughness={0.4} /></mesh>
      <mesh position={[0, 1.82, -0.036]}><planeGeometry args={[0.61, 0.055]} /><meshBasicMaterial color="#dfecd7" transparent opacity={0.75} /></mesh>
      <mesh position={[0, 2.0, -0.036]}><circleGeometry args={[0.078, 32]} /><meshBasicMaterial color="#e1edd6" /></mesh>
      <mesh position={[0, 1.38, -0.1]}><cylinderGeometry args={[0.045, 0.06, 0.25, 16]} /><meshStandardMaterial color="#c1c8b5" /></mesh>
      <RoundedBox args={[0.39, 0.045, 0.27]} radius={0.02} position={[0, 1.31, -0.1]}><meshStandardMaterial color="#d9dfd1" /></RoundedBox>
      <RoundedBox args={[0.73, 0.055, 0.24]} radius={0.025} position={[-0.06, 1.315, 0.27]} rotation={[0.05, 0, 0]}><meshStandardMaterial color="#eeeede" /></RoundedBox>
      {Array.from({ length: 3 }, (_, row) => Array.from({ length: 9 }, (_, column) => <mesh key={`${row}-${column}`} position={[-0.355 + column * 0.072, 1.347, 0.20 + row * 0.065]}><boxGeometry args={[0.052, 0.009, 0.044]} /><meshStandardMaterial color="#c3cbb5" /></mesh>))}
      <mesh position={[0.46, 1.33, 0.28]} scale={[0.075, 0.035, 0.12]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#e9ebdc" /></mesh>
    </group>
    <group position={[-1.63, 0.03, 0.05]} onClick={click(() => onActivity('water'))} onPointerOver={hover} onPointerOut={leave}>
      <mesh position={[0, 0.24, 0]}><cylinderGeometry args={[0.31, 0.23, 0.46, 32]} /><meshStandardMaterial color="#c8a692" roughness={0.85} /></mesh>
      <mesh position={[0, 0.47, 0]}><cylinderGeometry args={[0.28, 0.28, 0.028, 32]} /><meshStandardMaterial color="#72654e" /></mesh>
      <group ref={plant} position={[0, 0.47, 0]}>
        <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.024, 0.035, 0.71, 12]} /><meshStandardMaterial color="#75945b" /></mesh>
        {[0, 1, 2, 3, 4].map((index) => <group key={index} position={[0, 0.17 + index * 0.13, 0]} rotation={[0, index * 2.4, 0.4]}><mesh position={[0.14, 0.045, 0]} rotation={[0, 0, 0.3]} scale={[0.24, 0.075, 0.115]}><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color={index % 2 ? '#9aaf83' : '#6d905e'} roughness={0.7} /></mesh></group>)}
        {home.plantGrowth > 1 && <group position={[0, 0.83, 0]}>{Array.from({ length: 5 }, (_, index) => <mesh key={index} position={[Math.cos(index * Math.PI * 0.4) * 0.11, Math.sin(index * Math.PI * 0.4) * 0.11, 0]} scale={[0.09, 0.09, 0.035]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={home.plantGrowth > 3 ? '#f4d9b9' : '#f4f0d9'} /></mesh>)}<mesh position={[0, 0, 0.035]}><sphereGeometry args={[0.065, 16, 12]} /><meshStandardMaterial color="#d4b66b" /></mesh></group>}
      </group>
    </group>
    <group position={[-0.82, 0, -0.9]} onClick={click(() => onActivity('rest'))} onPointerOver={hover} onPointerOut={leave}>
      <RoundedBox args={[1.15, 0.15, 0.62]} radius={0.07} position={[0, 0.46, 0]}><meshStandardMaterial color={wood} /></RoundedBox>
      <RoundedBox args={[1.15, 0.52, 0.10]} radius={0.04} position={[0, 0.85, -0.27]}><meshStandardMaterial color={wood} /></RoundedBox>
      <RoundedBox args={[1, 0.15, 0.48]} radius={0.07} position={[0, 0.60, 0.01]}><meshStandardMaterial color="#d6dcc9" roughness={1} /></RoundedBox>
      {[-0.4, 0.4].map((x) => <mesh key={x} position={[x, 0.22, 0]}><boxGeometry args={[0.085, 0.45, 0.45]} /><meshStandardMaterial color={wood} /></mesh>)}
      <group position={[0.29, 0.72, 0.13]} rotation={[0.03, -0.1, 0.04]} onClick={click(() => onActivity('read'))}>
        <RoundedBox args={[0.35, 0.075, 0.24]} radius={0.02}><meshStandardMaterial color="#93a77b" /></RoundedBox>
        <mesh position={[0, 0.043, 0]}><boxGeometry args={[0.3, 0.02, 0.19]} /><meshStandardMaterial color="#eae3ca" /></mesh>
      </group>
    </group>
    <group position={[1.61, 0, 0.71]} onClick={click(() => onActivity('tea'))} onPointerOver={hover} onPointerOut={leave}>
      <mesh position={[0, 0.59, 0]}><cylinderGeometry args={[0.31, 0.31, 0.08, 32]} /><meshStandardMaterial color={wood} /></mesh>
      <mesh position={[0, 0.29, 0]}><cylinderGeometry args={[0.045, 0.075, 0.57, 16]} /><meshStandardMaterial color={wood} /></mesh>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.23, 0.24, 0.06, 24]} /><meshStandardMaterial color={wood} /></mesh>
      <group position={[0, 0.66, 0]}>
        <mesh position={[0, 0.10, 0]}><cylinderGeometry args={[0.10, 0.08, 0.2, 24]} /><meshStandardMaterial color="#eee9d5" roughness={0.4} /></mesh>
        <mesh position={[0.1, 0.1, 0]}><torusGeometry args={[0.065, 0.022, 8, 20]} /><meshStandardMaterial color="#eee9d5" /></mesh>
        <mesh position={[0, 0.204, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.084, 24]} /><meshStandardMaterial color="#998667" /></mesh>
        {!reducedMotion && <group ref={steam}>{[0, 1, 2].map((index) => <mesh key={index} scale={[0.025, 0.07, 0.025]}><sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial color="#faf9e9" transparent opacity={0.22 - index * 0.05} depthWrite={false} /></mesh>)}</group>}
      </group>
    </group>
  </group>;
}