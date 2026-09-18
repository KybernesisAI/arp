'use client';

/**
 * Interactive 3D identity badge, after Vercel's react-three-fiber event
 * badge: a lanyard on Rapier rope joints holding a physical card. The card
 * body is a real beveled slab with a slot for the clip (two extruded halves,
 * so front and back carry different prints); materials are the demo's
 * clearcoat + iridescence physical material over a near-black base. Drag to
 * swing it; click (without dragging) to flip it and read the back, which
 * carries a QR to the agent's connect link.
 */

import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, extend, useFrame, type ThreeElement } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint, type RapierRigidBody } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import QRCode from 'qrcode';
import type { BadgeData, BadgeTheme } from './BadgeClient';

extend({ MeshLineGeometry, MeshLineMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    meshLineGeometry: Omit<ThreeElement<typeof MeshLineGeometry>, 'args'> & { args?: ConstructorParameters<typeof MeshLineGeometry> };
    meshLineMaterial: Omit<ThreeElement<typeof MeshLineMaterial>, 'args'> & { args?: ConstructorParameters<typeof MeshLineMaterial> };
  }
}

// ------------------------------------------------------------------ geometry

// Card in local units (the visual group is scaled ×2.25): 0.711 × 1.0 × 0.02.
const W = 1.6 / 2.25;
const H = 1.0;
const DEPTH = 0.02;
const RADIUS = 0.06;
const SLOT = { w: 0.19, h: 0.038, y: H / 2 - 0.075, r: 0.019 };
const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * H) / W);

function roundedRect(path: THREE.Path, x: number, y: number, w: number, h: number, r: number): void {
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + h - r);
  path.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  path.lineTo(x + r, y + h);
  path.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + r);
  path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
}

/** Cap UVs map the card rectangle to 0..1 so a texture prints edge to edge. */
const capUVs: THREE.ExtrudeGeometryOptions['UVGenerator'] = {
  generateTopUV(_geometry, vertices, a, b, c) {
    const uv = (i: number) => new THREE.Vector2((vertices[i * 3]! + W / 2) / W, (vertices[i * 3 + 1]! + H / 2) / H);
    return [uv(a), uv(b), uv(c)];
  },
  generateSideWallUV(_geometry, vertices, a, b, c, d) {
    const uv = (i: number) => new THREE.Vector2(0.5, (vertices[i * 3 + 2]! + DEPTH) / DEPTH);
    return [uv(a), uv(b), uv(c), uv(d)];
  },
};

/** One half of the card (front or back), extruded toward -z from z=0, with the slot hole. */
function halfCard(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  roundedRect(shape, -W / 2, -H / 2, W, H, RADIUS);
  const hole = new THREE.Path();
  roundedRect(hole, -SLOT.w / 2, SLOT.y - SLOT.h / 2, SLOT.w, SLOT.h, SLOT.r);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH / 2, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 24, UVGenerator: capUVs });
  geo.translate(0, 0, -DEPTH / 2);
  return geo;
}

// ------------------------------------------------------------------ textures

const FONT = 'Inter, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
const BG = '#0b0b0d';
const BG_2 = '#141417';
const FG = '#f5f5f5';
const FG_2 = 'rgba(245,245,245,0.6)';
const FG_3 = 'rgba(245,245,245,0.35)';
const LINE = 'rgba(255,255,255,0.10)';

async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.all([document.fonts.load(`600 100px ${FONT}`), document.fonts.load(`400 40px ${FONT}`), document.fonts.load(`400 30px ${MONO}`)]);
  } catch { /* system fallback */ }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function baseCard(ctx: CanvasRenderingContext2D): void {
  // Near-black card with a soft radial sheen and fine grain, like anodized metal.
  const g = ctx.createRadialGradient(TEX_W * 0.3, TEX_H * 0.15, 50, TEX_W * 0.5, TEX_H * 0.5, TEX_H * 0.9);
  g.addColorStop(0, '#1a1a1e');
  g.addColorStop(0.5, BG_2);
  g.addColorStop(1, BG);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const noise = ctx.createImageData(TEX_W, TEX_H);
  for (let i = 0; i < noise.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 22;
    noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = v;
    noise.data[i + 3] = 18;
  }
  ctx.putImageData(noise, 0, 0);
  // Slot (drawn dark so the hole reads even where the print covers the cap edge).
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(TEX_W / 2 - (SLOT.w / W) * TEX_W / 2, TEX_H * (1 - (SLOT.y + H / 2 + SLOT.h / 2) / H), (SLOT.w / W) * TEX_W, (SLOT.h / H) * TEX_H, 40);
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = FG_3): void {
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = color;
  ctx.letterSpacing = '3px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ok: boolean): number {
  ctx.font = `500 24px ${FONT}`;
  const w = ctx.measureText(text).width + 56;
  ctx.fillStyle = ok ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.roundRect(x, y - 30, w, 44, 22); ctx.fill();
  ctx.strokeStyle = ok ? 'rgba(52,211,153,0.35)' : LINE; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = ok ? '#34d399' : FG_3;
  ctx.beginPath(); ctx.arc(x + 22, y - 8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ok ? FG : FG_2;
  ctx.fillText(text, x + 38, y);
  return w + 14;
}

async function drawFront(data: BadgeData): Promise<THREE.CanvasTexture> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W; canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;
  baseCard(ctx);
  const pad = 80;

  // Header row.
  label(ctx, 'AgentID', pad, 150, FG_2);
  ctx.textAlign = 'right';
  label(ctx, `Since ${data.since}`, TEX_W - pad, 150);
  ctx.textAlign = 'left';

  // Profile picture: circle with a thin ring.
  const R = 150;
  const cx = pad + R, cy = 240 + R;
  const img = await loadImage(data.avatarUrl);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (img) ctx.drawImage(img, cx - R, cy - R, R * 2, R * 2);
  else {
    const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    g.addColorStop(0, '#3a3a44'); g.addColorStop(1, '#17171b');
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = FG; ctx.font = `600 140px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(data.name.slice(0, 1).toUpperCase(), cx, cy + 6);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2); ctx.stroke();

  // Name + address.
  let y = cy + R + 110;
  ctx.fillStyle = FG;
  ctx.font = `600 104px ${FONT}`;
  ctx.letterSpacing = '-3px';
  let name = data.name;
  while (ctx.measureText(name).width > TEX_W - pad * 2 && name.length > 3) name = name.slice(0, -2) + '…';
  ctx.fillText(name, pad - 4, y);
  ctx.letterSpacing = '0px';
  y += 70;
  ctx.font = `400 46px ${FONT}`;
  ctx.fillStyle = FG_2;
  ctx.fillText(`${data.sld}.agent`, pad, y);

  // Description (max 3 lines).
  y += 80;
  ctx.font = `400 33px ${FONT}`;
  ctx.fillStyle = FG_2;
  const words = data.description.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > TEX_W - pad * 2 && line) { lines.push(line); line = w; if (lines.length === 3) break; } else line = t;
  }
  if (line && lines.length < 3) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, pad, y + i * 46));
  y += lines.length * 46 + 40;

  // Status chips.
  let x = pad;
  x += chip(ctx, data.ownerVerified ? 'Owner verified' : 'Owner pending', x, y, data.ownerVerified);
  x += chip(ctx, data.cardSigned ? 'Signed' : 'Unsigned', x, y, data.cardSigned);
  chip(ctx, data.runtime ? 'Connected' : 'Identity only', x, y, data.runtime);

  // Footer: DID and a hairline.
  ctx.fillStyle = LINE; ctx.fillRect(pad, TEX_H - pad - 92, TEX_W - pad * 2, 1);
  ctx.font = `400 26px ${MONO}`; ctx.fillStyle = FG_3;
  ctx.fillText(data.did, pad, TEX_H - pad - 44);
  ctx.textAlign = 'right';
  ctx.fillText(data.mirrorHost, TEX_W - pad, TEX_H - pad - 44);
  ctx.textAlign = 'left';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  return tex;
}

/** Back print. Drawn mirrored: the back cap's UVs run right-to-left. */
async function drawBack(data: BadgeData): Promise<THREE.CanvasTexture> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W; canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(TEX_W, 0); ctx.scale(-1, 1);
  baseCard(ctx);
  const pad = 80;
  label(ctx, 'Connect', pad, 150, FG_2);
  ctx.textAlign = 'right'; label(ctx, data.did.replace('did:web:', ''), TEX_W - pad, 150); ctx.textAlign = 'left';

  // QR to the connect link, framed.
  const q = 520;
  const qx = (TEX_W - q) / 2, qy = 210;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.roundRect(qx - 28, qy - 28, q + 56, q + 56, 28); ctx.fill();
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, data.connectUrl, { margin: 0, width: q, errorCorrectionLevel: 'M', color: { dark: '#0b0b0d', light: '#ffffff' } });
  ctx.drawImage(qr, qx, qy);
  ctx.textAlign = 'center';
  ctx.font = `500 30px ${FONT}`; ctx.fillStyle = FG;
  ctx.fillText('Scan to connect with this agent', TEX_W / 2, qy + q + 92);
  ctx.font = `400 24px ${MONO}`; ctx.fillStyle = FG_3;
  ctx.fillText(data.connectUrl.replace(/^https:\/\//, ''), TEX_W / 2, qy + q + 132);
  ctx.textAlign = 'left';

  // Data rows.
  let y = qy + q + 215;
  const rows: Array<[string, string]> = [
    ['Owner', data.ownerVerified ? (data.ownerLabel ?? 'verified') : 'not verified'],
    ['Reachable at', data.mirrorHost],
    ['A2A endpoint', data.a2aEndpoint.replace(/^https:\/\//, '')],
    ['Card', data.cardSigned ? 'signed by this name' : 'unsigned'],
    ['Since', data.since],
    ...data.links.slice(0, 3).map((l) => [l.kind, l.value] as [string, string]),
  ];
  for (const [k, v] of rows) {
    if (y > TEX_H - pad - 40) break;
    ctx.fillStyle = LINE; ctx.fillRect(pad, y - 34, TEX_W - pad * 2, 1);
    label(ctx, k, pad, y);
    ctx.font = `400 27px ${MONO}`; ctx.fillStyle = FG;
    let val = v;
    while (ctx.measureText(val).width > TEX_W - pad * 2 - 300 && val.length > 4) val = val.slice(0, -2) + '…';
    ctx.fillText(val, pad + 290, y);
    y += 58;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  return tex;
}

function drawStrap(sld: string, theme: BadgeTheme): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = theme === 'dark' ? '#1c1c20' : '#111114';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 44px ${FONT}`;
  ctx.letterSpacing = '10px';
  ctx.textBaseline = 'middle';
  const unit = `AGENTID   ·   ${sld.toUpperCase()}.AGENT   ·   `;
  const w = ctx.measureText(unit).width;
  for (let x = -w; x < canvas.width + w; x += w) ctx.fillText(unit, x, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  return tex;
}

// ------------------------------------------------------------------ scene

const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 2, linearDamping: 2 } as const;

function Band({ data, theme, maxSpeed = 50, minSpeed = 10 }: { data: BadgeData; theme: BadgeTheme; maxSpeed?: number; minSpeed?: number }): React.JSX.Element {
  const band = useRef<THREE.Mesh<MeshLineGeometry, MeshLineMaterial>>(null);
  const fixed = useRef<RapierRigidBody>(null!);
  const j1 = useRef<RapierRigidBody>(null!);
  const j2 = useRef<RapierRigidBody>(null!);
  const j3 = useRef<RapierRigidBody>(null!);
  const card = useRef<RapierRigidBody>(null!);
  const visual = useRef<THREE.Group>(null);
  const vec = useMemo(() => new THREE.Vector3(), []);
  const ang = useMemo(() => new THREE.Vector3(), []);
  const rot = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const [dragged, drag] = useState<THREE.Vector3 | false>(false);
  const [hovered, hover] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const press = useRef<{ x: number; y: number; t: number } | null>(null);
  const [front, setFront] = useState<THREE.CanvasTexture | null>(null);
  const [back, setBack] = useState<THREE.CanvasTexture | null>(null);
  const strap = useMemo(() => drawStrap(data.sld, theme), [data.sld, theme]);
  const frontGeo = useMemo(() => halfCard(), []);
  const backGeo = useMemo(() => { const g = halfCard(); g.rotateY(Math.PI); return g; }, []);
  const [curve] = useState(() => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]));

  useEffect(() => {
    let alive = true;
    void drawFront(data).then((t) => (alive ? setFront(t) : t.dispose()));
    void drawBack(data).then((t) => (alive ? setBack(t) : t.dispose()));
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
    // Flip: the print turns inside the body, the physics never notices.
    if (visual.current) {
      const target = flipped ? Math.PI : 0;
      visual.current.rotation.y += (target - visual.current.rotation.y) * Math.min(1, delta * 7);
    }
  });

  curve.curveType = 'chordal';
  const capMaterial = (map: THREE.Texture | null) => (
    <meshPhysicalMaterial
      attach="material-0"
      map={map ?? undefined}
      color={map ? '#ffffff' : BG_2}
      clearcoat={1}
      clearcoatRoughness={0.15}
      roughness={0.3}
      metalness={0.5}
      iridescence={1}
      iridescenceThicknessRange={[0, 2400]}
    />
  );

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
            onPointerUp={(e) => {
              (e.target as Element).releasePointerCapture(e.pointerId);
              drag(false);
              const p = press.current;
              press.current = null;
              if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6 && Date.now() - p.t < 350) setFlipped((f) => !f);
            }}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture(e.pointerId);
              press.current = { x: e.clientX, y: e.clientY, t: Date.now() };
              drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())));
            }}
          >
            <group ref={visual} position={[0, 0.5, 0]}>
              {/* Front half: printed cap faces +z. */}
              <mesh geometry={frontGeo} position={[0, 0, DEPTH / 2]}>
                {capMaterial(front)}
                <meshStandardMaterial attach="material-1" color="#2a2a30" metalness={0.9} roughness={0.35} />
              </mesh>
              {/* Back half: rotated so its printed cap faces -z. */}
              <mesh geometry={backGeo} position={[0, 0, -DEPTH / 2]}>
                {capMaterial(back)}
                <meshStandardMaterial attach="material-1" color="#2a2a30" metalness={0.9} roughness={0.35} />
              </mesh>
              {/* Clip through the slot + clamp above it. */}
              <mesh position={[0, SLOT.y + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.045, 0.011, 16, 48]} />
                <meshStandardMaterial color="#e6e6e6" metalness={1} roughness={0.25} />
              </mesh>
              <mesh position={[0, SLOT.y + 0.075, 0]}>
                <boxGeometry args={[0.15, 0.04, 0.03]} />
                <meshStandardMaterial color="#d4d4d4" metalness={1} roughness={0.3} />
              </mesh>
            </group>
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

export function BadgeScene({ data, theme }: { data: BadgeData; theme: BadgeTheme }): React.JSX.Element {
  return (
    <Canvas camera={{ position: [0, 0, 13], fov: 25 }} style={{ backgroundColor: 'transparent' }} dpr={[1, 2]} gl={{ antialias: true }}>
      <ambientLight intensity={Math.PI} />
      <Physics interpolate gravity={[0, -40, 0]} timeStep={1 / 60}>
        <Band data={data} theme={theme} />
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
