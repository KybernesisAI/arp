'use client';

/**
 * Interactive 3D identity badge — a lanyard on rope joints (Rapier) holding a
 * physical card whose face is a canvas drawn in the ARP design system, with
 * the agent's name, .agent address, verification marks and a QR to its
 * profile. Look and feel after Vercel's event badge (react-three-fiber +
 * drei + rapier + meshline); the card and clip here are procedural, no GLB.
 */

import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, extend, useFrame, type ThreeElement } from '@react-three/fiber';
import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint, type RapierRigidBody } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import QRCode from 'qrcode';
import type { BadgeData } from './BadgeClient';

extend({ MeshLineGeometry, MeshLineMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    meshLineGeometry: Omit<ThreeElement<typeof MeshLineGeometry>, 'args'> & { args?: ConstructorParameters<typeof MeshLineGeometry> };
    meshLineMaterial: Omit<ThreeElement<typeof MeshLineMaterial>, 'args'> & { args?: ConstructorParameters<typeof MeshLineMaterial> };
  }
}

const PAPER = '#f1ede4';
const PAPER_2 = '#e8e3d6';
const INK = '#0c0c0c';
const MUTED = '#6b6a62';
const BLUE = '#1536e6';
const GREEN = '#0f7a4a';

const DISPLAY = '"Space Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

// Card aspect 1.6 : 2.25 (portrait), like a conference badge.
const CARD_W = 1.6;
const CARD_H = 2.25;
const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * CARD_H) / CARD_W);

async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.all([
      document.fonts.load(`500 120px ${DISPLAY}`),
      document.fonts.load(`400 40px ${MONO}`),
      document.fonts.load(`600 40px ${MONO}`),
    ]);
  } catch {
    /* fall back to system fonts */
  }
}

function kicker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = MUTED): void {
  ctx.font = `600 22px ${MONO}`;
  ctx.fillStyle = color;
  ctx.letterSpacing = '4px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

/** Draw the card face into a canvas and wrap it as a texture. */
async function drawCardTexture(data: BadgeData): Promise<THREE.CanvasTexture> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;
  const pad = 72;

  // Paper + faint grid, the ARP surface.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.strokeStyle = 'rgba(12,12,12,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= TEX_W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TEX_H); ctx.stroke(); }
  for (let y = 0; y <= TEX_H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TEX_W, y); ctx.stroke(); }

  // Slot for the clip.
  ctx.fillStyle = PAPER_2;
  ctx.beginPath();
  ctx.roundRect(TEX_W / 2 - 90, 44, 180, 30, 15);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Header rule + kickers.
  ctx.fillStyle = INK;
  ctx.fillRect(pad, 130, TEX_W - pad * 2, 3);
  kicker(ctx, 'AGENT ID', pad, 118, INK);
  ctx.textAlign = 'right';
  kicker(ctx, `N.${data.since.replace(/-/g, '')}`, TEX_W - pad, 118);
  ctx.textAlign = 'left';

  // Name.
  ctx.fillStyle = INK;
  ctx.font = `500 132px ${DISPLAY}`;
  ctx.letterSpacing = '-4px';
  let name = data.name;
  while (ctx.measureText(name).width > TEX_W - pad * 2 && name.length > 3) name = name.slice(0, -2) + '…';
  ctx.fillText(name, pad - 6, 300);
  // Address in signal blue.
  ctx.font = `500 76px ${DISPLAY}`;
  ctx.letterSpacing = '-2px';
  ctx.fillStyle = BLUE;
  ctx.fillText(`${data.sld}.agent`, pad - 2, 395);
  ctx.letterSpacing = '0px';

  // Description.
  ctx.fillStyle = MUTED;
  ctx.font = `400 34px ${DISPLAY}`;
  const words = data.description.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > TEX_W - pad * 2 - 300 && line) { lines.push(line); line = w; } else line = test;
    if (lines.length === 3) break;
  }
  if (line && lines.length < 3) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, pad, 470 + i * 44));

  // Marks (verified rows).
  const marks: Array<[string, string, boolean]> = [
    ['OWNER', data.ownerVerified ? 'verified' : 'not verified', data.ownerVerified],
    ['CARD', data.cardSigned ? 'signed by this name' : 'unsigned', data.cardSigned],
    ['RUNTIME', data.runtime ? 'connected' : 'identity only', data.runtime],
    ...data.links.slice(0, 2).map((l) => [l.kind, l.value, true] as [string, string, boolean]),
  ];
  let y = 660;
  for (const [k, v, ok] of marks) {
    ctx.fillStyle = 'rgba(12,12,12,0.12)';
    ctx.fillRect(pad, y - 36, TEX_W - pad * 2 - 300, 1);
    ctx.beginPath();
    ctx.arc(pad + 10, y - 10, 7, 0, Math.PI * 2);
    ctx.fillStyle = ok ? GREEN : '#f2c14b';
    ctx.fill();
    kicker(ctx, k, pad + 34, y - 2);
    ctx.font = `400 30px ${MONO}`;
    ctx.fillStyle = INK;
    ctx.fillText(v, pad + 250, y - 2);
    y += 64;
  }

  // QR → public profile (bottom right).
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, data.profileUrl, { margin: 0, width: 260, color: { dark: INK, light: PAPER } });
  ctx.drawImage(qr, TEX_W - pad - 260, TEX_H - pad - 260 - 90);
  ctx.textAlign = 'right';
  kicker(ctx, 'SCAN · PROFILE', TEX_W - pad, TEX_H - pad - 60);
  ctx.textAlign = 'left';

  // Footer: DID + mirror host.
  ctx.fillStyle = INK;
  ctx.fillRect(pad, TEX_H - pad - 130, TEX_W - pad * 2 - 320, 3);
  ctx.font = `400 26px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(data.did, pad, TEX_H - pad - 88);
  ctx.fillStyle = INK;
  ctx.fillText(data.mirrorHost, pad, TEX_H - pad - 50);
  kicker(ctx, 'ARP · THE SECURE NETWORK FOR AI AGENTS', pad, TEX_H - pad - 12);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/** Lanyard strap texture: repeating wordmark on signal blue. */
function drawBandTexture(sld: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = PAPER;
  ctx.font = `600 46px ${MONO}`;
  ctx.letterSpacing = '8px';
  ctx.textBaseline = 'middle';
  const unit = `${sld.toUpperCase()}.AGENT   ·   ARP   ·   `;
  const w = ctx.measureText(unit).width;
  for (let x = -w; x < canvas.width + w; x += w) ctx.fillText(unit, x, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  return tex;
}

/** Card back: paper, a big wordmark, the address and DID. */
function drawBackTexture(data: BadgeData): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;
  const pad = 72;
  ctx.fillStyle = PAPER_2;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.strokeStyle = 'rgba(12,12,12,0.07)';
  for (let x = 0; x <= TEX_W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TEX_H); ctx.stroke(); }
  for (let y = 0; y <= TEX_H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TEX_W, y); ctx.stroke(); }
  ctx.fillStyle = PAPER;
  ctx.beginPath(); ctx.roundRect(TEX_W / 2 - 90, 44, 180, 30, 15); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = BLUE;
  ctx.fillRect(pad, TEX_H / 2 - 150, 90, 90);
  ctx.fillStyle = INK;
  ctx.font = `500 200px ${DISPLAY}`;
  ctx.letterSpacing = '-8px';
  ctx.fillText('ARP', pad + 120, TEX_H / 2 - 70);
  ctx.letterSpacing = '0px';
  kicker(ctx, 'THE SECURE NETWORK FOR AI AGENTS', pad, TEX_H / 2 + 10);
  ctx.font = `400 30px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`${data.sld}.agent`, pad, TEX_H - pad - 60);
  ctx.fillText(data.did, pad, TEX_H - pad - 20);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 2, linearDamping: 2 } as const;

function Band({ data, maxSpeed = 50, minSpeed = 10 }: { data: BadgeData; maxSpeed?: number; minSpeed?: number }): React.JSX.Element {
  const band = useRef<THREE.Mesh<MeshLineGeometry, MeshLineMaterial>>(null);
  const fixed = useRef<RapierRigidBody>(null!);
  const j1 = useRef<RapierRigidBody>(null!);
  const j2 = useRef<RapierRigidBody>(null!);
  const j3 = useRef<RapierRigidBody>(null!);
  const card = useRef<RapierRigidBody>(null!);
  const vec = useMemo(() => new THREE.Vector3(), []);
  const ang = useMemo(() => new THREE.Vector3(), []);
  const rot = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const [dragged, drag] = useState<THREE.Vector3 | false>(false);
  const [hovered, hover] = useState(false);
  const [face, setFace] = useState<THREE.CanvasTexture | null>(null);
  const strap = useMemo(() => drawBandTexture(data.sld), [data.sld]);
  const back = useMemo(() => drawBackTexture(data), [data]);
  const [curve] = useState(() => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]));

  useEffect(() => {
    let alive = true;
    void drawCardTexture(data).then((t) => { if (alive) setFace(t); else t.dispose(); });
    return () => { alive = false; };
  }, [data]);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.45, 0]]);

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
      return () => void (document.body.style.cursor = 'auto');
    }
    return () => void (document.body.style.cursor = 'auto');
  }, [hovered, dragged]);

  useFrame((state, delta) => {
    if (!fixed.current || !j1.current || !j2.current || !j3.current || !band.current || !card.current) return;
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp());
      card.current.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z });
    }
    const lerped = [j1, j2].map((ref) => {
      const l = new THREE.Vector3().copy(ref.current.translation());
      const clamped = Math.max(0.1, Math.min(1, l.distanceTo(ref.current.translation())));
      return l.lerp(ref.current.translation(), delta * (minSpeed + clamped * (maxSpeed - minSpeed)));
    });
    curve.points[0]!.copy(j3.current.translation());
    curve.points[1]!.copy(lerped[1]!);
    curve.points[2]!.copy(lerped[0]!);
    curve.points[3]!.copy(fixed.current.translation());
    band.current.geometry.setPoints(curve.getPoints(32));
    ang.copy(card.current.angvel());
    rot.copy(card.current.rotation());
    card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z }, false);
  });

  curve.curveType = 'chordal';

  return (
    <>
      <group position={[0, 4.6, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[2, 0, 0]} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            scale={2.25}
            position={[0, -1.25, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(e) => { (e.target as Element).releasePointerCapture(e.pointerId); drag(false); }}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation()))); }}
          >
            {/* The card: a paper slab (clearcoat) with the drawn faces on
                exact-fit planes, so the texture maps 1:1 — RoundedBox's own UVs
                do not span the face. */}
            <RoundedBox args={[CARD_W / 2.25, CARD_H / 2.25, 0.02]} radius={0.035} smoothness={6} position={[0, 0.5, 0]}>
              <meshPhysicalMaterial color={PAPER_2} clearcoat={1} clearcoatRoughness={0.2} roughness={0.5} metalness={0.1} />
            </RoundedBox>
            <mesh position={[0, 0.5, 0.0105]}>
              <planeGeometry args={[CARD_W / 2.25 - 0.02, CARD_H / 2.25 - 0.02]} />
              <meshPhysicalMaterial map={face ?? undefined} color={face ? '#ffffff' : PAPER} clearcoat={1} clearcoatRoughness={0.15} roughness={0.35} metalness={0.2} iridescence={0.35} iridescenceThicknessRange={[100, 800]} />
            </mesh>
            <mesh position={[0, 0.5, -0.0105]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[CARD_W / 2.25 - 0.02, CARD_H / 2.25 - 0.02]} />
              <meshPhysicalMaterial map={back} clearcoat={1} clearcoatRoughness={0.2} roughness={0.45} metalness={0.1} />
            </mesh>
            {/* Clip + clamp: brushed metal ring through the slot. */}
            <mesh position={[0, 0.975, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.05, 0.011, 12, 32]} />
              <meshStandardMaterial color="#d9d6cc" metalness={1} roughness={0.3} />
            </mesh>
            <RoundedBox args={[0.15, 0.045, 0.028]} radius={0.01} position={[0, 0.985, 0]}>
              <meshStandardMaterial color="#c9c5ba" metalness={1} roughness={0.35} />
            </RoundedBox>
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial color="white" depthTest={false} resolution={new THREE.Vector2(2, 1)} useMap={1} map={strap} repeat={new THREE.Vector2(-4, 1)} lineWidth={0.62} />
      </mesh>
    </>
  );
}

export function BadgeScene({ data }: { data: BadgeData }): React.JSX.Element {
  return (
    <Canvas camera={{ position: [0, 0, 13], fov: 25 }} style={{ backgroundColor: 'transparent' }} dpr={[1, 2]}>
      <ambientLight intensity={Math.PI} />
      <Physics interpolate gravity={[0, -40, 0]} timeStep={1 / 60}>
        <Band data={data} />
      </Physics>
      <Environment blur={0.75}>
        <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
      </Environment>
    </Canvas>
  );
}
