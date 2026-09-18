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
import { Environment, Lightformer, useGLTF } from '@react-three/drei';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint, type RapierRigidBody } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import QRCode from 'qrcode';
import type { BadgeData, BadgeTheme } from './BadgeClient';

extend({ MeshLineGeometry, MeshLineMaterial });
useGLTF.preload('/assets/badge/card.glb');

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
const BEVEL = 0.004;
// Print faces sit just outside the beveled caps (the bevel pushes each cap out by BEVEL).
const PRINT_Z = DEPTH / 2 + BEVEL + 0.0008;
const CARD_CENTER_Y = 0.523; // reference card spans local y 0.023..1.023
const SLOT = { w: 0.17, h: 0.036, y: H / 2 - 0.035, r: 0.018 };
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

function cardShape(): THREE.Shape {
  const shape = new THREE.Shape();
  roundedRect(shape, -W / 2, -H / 2, W, H, RADIUS);
  const hole = new THREE.Path();
  roundedRect(hole, -SLOT.w / 2, SLOT.y - SLOT.h / 2, SLOT.w, SLOT.h, SLOT.r);
  shape.holes.push(hole);
  return shape;
}

/** The slab: beveled, with the slot, centred on z=0. Unprinted dark metal. */
function bodyGeometry(): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(cardShape(), { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3, curveSegments: 24 });
  geo.translate(0, 0, -DEPTH / 2);
  return geo;
}

/** A flat print face (same outline + slot) with UVs spanning the card 0..1. */
function printGeometry(): THREE.ShapeGeometry {
  const geo = new THREE.ShapeGeometry(cardShape(), 24);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + H / 2) / H);
  uv.needsUpdate = true;
  return geo;
}

// ------------------------------------------------------------------ textures

const FONT = 'Inter, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"Space Mono", "SF Mono", Menlo, Consolas, monospace';
const BG = '#050506';
const BG_2 = '#0d0d10';
const FG = '#e9e7e2'; // platinum
const FG_2 = 'rgba(233,231,226,0.62)';
const FG_3 = 'rgba(233,231,226,0.36)';
const LINE = 'rgba(233,231,226,0.10)';

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await withTimeout(Promise.all([document.fonts.load(`600 100px ${FONT}`), document.fonts.load(`400 40px ${FONT}`), document.fonts.load(`400 30px ${MONO}`), document.fonts.load(`700 30px ${MONO}`)]).then(() => undefined), 1500, undefined);
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return withTimeout(new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  }), 4000, null);
}

function baseCard(ctx: CanvasRenderingContext2D): void {
  // Onyx: near-black with a cool, brushed-platinum sheen running diagonally.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const sheen = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
  sheen.addColorStop(0, 'rgba(120,122,130,0.00)');
  sheen.addColorStop(0.28, 'rgba(120,122,130,0.05)');
  sheen.addColorStop(0.42, 'rgba(190,192,198,0.14)');
  sheen.addColorStop(0.5, 'rgba(120,122,130,0.05)');
  sheen.addColorStop(0.72, 'rgba(90,92,100,0.03)');
  sheen.addColorStop(1, 'rgba(120,122,130,0.00)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const vignette = ctx.createRadialGradient(TEX_W / 2, TEX_H / 2, TEX_H * 0.2, TEX_W / 2, TEX_H / 2, TEX_H * 0.85);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // Brushed grain, blended on top (putImageData would replace every pixel).
  const grain = document.createElement('canvas');
  grain.width = TEX_W; grain.height = TEX_H;
  const gctx = grain.getContext('2d')!;
  const noise = gctx.createImageData(TEX_W, TEX_H);
  for (let y = 0; y < TEX_H; y++) {
    const rowBias = (Math.random() - 0.5) * 10;
    for (let x = 0; x < TEX_W; x++) {
      const i = (y * TEX_W + x) * 4;
      const v = 128 + rowBias + (Math.random() - 0.5) * 14;
      noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = v;
      noise.data[i + 3] = 255;
    }
  }
  gctx.putImageData(noise, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(grain, 0, 0);
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = FG_3): void {
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = color;
  ctx.letterSpacing = '3px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ok: boolean): number {
  ctx.font = `400 30px ${MONO}`;
  ctx.letterSpacing = '2px';
  const w = ctx.measureText(text.toUpperCase()).width + 74;
  ctx.letterSpacing = '0px';
  ctx.fillStyle = ok ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.roundRect(x, y - 42, w, 62, 31); ctx.fill();
  ctx.strokeStyle = ok ? 'rgba(52,211,153,0.4)' : LINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = ok ? '#34d399' : FG_3;
  ctx.beginPath(); ctx.arc(x + 30, y - 11, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ok ? FG : FG_2;
  ctx.letterSpacing = '2px';
  ctx.fillText(text.toUpperCase(), x + 50, y);
  ctx.letterSpacing = '0px';
  return w + 16;
}

function paintFront(canvas: HTMLCanvasElement, data: BadgeData, img: HTMLImageElement | null): void {
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
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (img) {
    // Kybernesis portraits are a white disc inset in a black square; scale so the disc fills the circle.
    const z = data.avatarUrl.startsWith('/assets/badge/avatars/') ? 1.18 : 1;
    ctx.drawImage(img, cx - R * z, cy - R * z, R * 2 * z, R * 2 * z);
  }
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
  const chips: Array<[string, boolean]> = [
    [data.ownerVerified ? 'Owner verified' : 'Owner pending', data.ownerVerified],
    [data.runtime ? 'Connected' : 'Identity only', data.runtime],
    data.cardSigned ? ['Signed card', true] : data.selfHeldKey ? ['Self-held key', true] : ['Card unsigned', false],
  ];
  let x = pad;
  for (const [text, ok] of chips) {
    ctx.font = `400 30px ${MONO}`;
    ctx.letterSpacing = '2px';
    const w = ctx.measureText(text.toUpperCase()).width + 74;
    ctx.letterSpacing = '0px';
    if (x + w > TEX_W - pad) { x = pad; y += 78; }
    x += chip(ctx, text, x, y, ok);
  }

  // Footer: DID and a hairline.
  ctx.fillStyle = LINE; ctx.fillRect(pad, TEX_H - pad - 92, TEX_W - pad * 2, 1);
  ctx.font = `400 26px ${MONO}`; ctx.fillStyle = FG_3;
  ctx.fillText(data.did, pad, TEX_H - pad - 44);
  ctx.textAlign = 'right';
  ctx.fillText(data.mirrorHost, TEX_W - pad, TEX_H - pad - 44);
  ctx.textAlign = 'left';
}

/** Front print: shows at once with a monogram; the picture is painted in when it loads. */
async function drawFront(data: BadgeData, onUpdate: (t: THREE.CanvasTexture) => void): Promise<THREE.CanvasTexture> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W; canvas.height = TEX_H;
  paintFront(canvas, data, null);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  void loadImage(data.avatarUrl).then((img) => {
    if (!img) return;
    paintFront(canvas, data, img);
    tex.needsUpdate = true;
    onUpdate(tex);
  });
  return tex;
}

/** Back print. */
async function drawBack(data: BadgeData): Promise<THREE.CanvasTexture> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W; canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;
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
    ['Key', data.cardSigned ? 'hosted · card signed by this name' : data.selfHeldKey ? 'self-held by the owner' : 'hosted · card not yet signed'],
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
  canvas.width = 2048; canvas.height = 112;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = theme === 'dark' ? '#121215' : '#0c0c0e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(233,231,226,0.9)';
  ctx.font = `600 34px ${FONT}`;
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
  const strapEnd = useRef<THREE.Object3D>(null);
  const strapTmp = useMemo(() => new THREE.Vector3(), []);
  const vec = useMemo(() => new THREE.Vector3(), []);
  const ang = useMemo(() => new THREE.Vector3(), []);
  const rot = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const proj = useMemo(() => new THREE.Vector3(), []);
  const [dragged, drag] = useState<THREE.Vector3 | false>(false);
  const [hovered, hover] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const { nodes, materials } = useGLTF('/assets/badge/card.glb') as unknown as { nodes: Record<string, THREE.Mesh>; materials: Record<string, THREE.Material> };
  const tilt = useRef({ x: 0, y: 0 });
  const press = useRef<{ x: number; y: number; t: number } | null>(null);
  const [front, setFront] = useState<THREE.CanvasTexture | null>(null);
  const [back, setBack] = useState<THREE.CanvasTexture | null>(null);
  const strap = useMemo(() => drawStrap(data.sld, theme), [data.sld, theme]);
  const bodyGeo = useMemo(() => bodyGeometry(), []);
  const printGeo = useMemo(() => printGeometry(), []);
  const [curve] = useState(() => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]));

  useEffect(() => {
    let alive = true;
    void drawFront(data, (t) => { if (alive) setFront(t); }).then((t) => (alive ? setFront(t) : t.dispose()));
    void drawBack(data).then((t) => (alive ? setBack(t) : t.dispose()));
    return () => { alive = false; };
  }, [data]);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  // Anchor at the top of the clamp (clip group is raised 0.055 local), so the
  // strap ends where the swivel starts instead of lying over it.
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.6, 0]]);

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
    // The strap ends at the clamp as it actually sits (tilt + flip included),
    // not at the rope joint, so the lanyard moves with the badge.
    if (strapEnd.current) {
      strapEnd.current.getWorldPosition(strapTmp);
      curve.points[0]!.copy(strapTmp);
    } else {
      curve.points[0]!.copy(j3.current.translation());
    }
    curve.points[1]!.copy(lerped[1]!);
    curve.points[2]!.copy(lerped[0]!);
    curve.points[3]!.copy(fixed.current.translation());
    band.current.geometry.setPoints(curve.getPoints(32));
    ang.copy(card.current.angvel());
    rot.copy(card.current.rotation());
    card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z }, false);
    // Flip + parallax tilt happen on the visual group inside the body; the
    // physics never notices. Tilt follows the pointer while hovered.
    if (visual.current) {
      const k = Math.min(1, delta * 9);
      // Pointer offset from the card's own centre on screen, so the tilt follows
      // where you are over the badge, not where you are on the page.
      let dx = 0, dy = 0;
      if (hovered && !dragged) {
        const t = card.current.translation();
        proj.set(t.x, t.y - 0.1, t.z).project(state.camera);
        dx = Math.max(-1, Math.min(1, (state.pointer.x - proj.x) * 3.2));
        dy = Math.max(-1, Math.min(1, (state.pointer.y - proj.y) * 2.2));
      }
      const targetY = (flipped ? Math.PI : 0) + dx * 0.55;
      const targetX = -dy * 0.45;
      tilt.current.x += (targetX - tilt.current.x) * k;
      tilt.current.y += (targetY - tilt.current.y) * k;
      visual.current.rotation.set(tilt.current.x, tilt.current.y, 0);
      const s = hovered && !dragged ? 1.025 : 1;
      visual.current.scale.setScalar(visual.current.scale.x + (s - visual.current.scale.x) * k);
    }
  });

  curve.curveType = 'chordal';
  const printMaterial = (map: THREE.Texture | null) => (
    <meshPhysicalMaterial
      map={map ?? undefined}
      color={map ? '#ffffff' : BG_2}
      clearcoat={1}
      clearcoatRoughness={0.12}
      roughness={0.32}
      metalness={0.42}
      iridescence={0.22}
      iridescenceThicknessRange={[100, 900]}
      envMapIntensity={0.9}
      side={THREE.FrontSide}
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
            <group ref={visual} position={[0, CARD_CENTER_Y, 0]}>
              {/* Body: onyx slab with the slot. */}
              <mesh geometry={bodyGeo}>
                <meshPhysicalMaterial color="#141417" metalness={0.8} roughness={0.32} clearcoat={0.7} clearcoatRoughness={0.25} envMapIntensity={0.8} />
              </mesh>
              {/* Prints: flat faces a hair off the body, front toward the camera (+z). */}
              <mesh geometry={printGeo} position={[0, 0, PRINT_Z]}>
                {printMaterial(front)}
              </mesh>
              <mesh geometry={printGeo} position={[0, 0, -PRINT_Z]} rotation={[0, Math.PI, 0]}>
                {printMaterial(back)}
              </mesh>
              {/* Clip + clamp from the reference model, in its own frame (card origin at the bottom). */}
              {/* Where the strap enters the clamp: top of the clamp, in the tilting frame. */}
              {/* Strap ends at the centre of the swivel loop (loop spans ~1.12–1.23 local, clip group raised 0.055). */}
              <object3D ref={strapEnd} position={[0, 1.212 - CARD_CENTER_Y + 0.055, 0]} />
              <group position={[0, -CARD_CENTER_Y + 0.055, 0]}>
                <mesh geometry={nodes['clip']!.geometry} material={materials['metal']} material-roughness={0.3} />
                <mesh geometry={nodes['clamp']!.geometry} material={materials['metal']} />
              </group>
            </group>
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial color="white" depthTest resolution={new THREE.Vector2(2, 1)} useMap={1} map={strap} repeat={new THREE.Vector2(-3, 1)} lineWidth={0.85} />
      </mesh>
    </>
  );
}

export function BadgeScene({ data, theme }: { data: BadgeData; theme: BadgeTheme }): React.JSX.Element {
  return (
    <Canvas camera={{ position: [0, 0, 13], fov: 25 }} style={{ backgroundColor: 'transparent' }} dpr={[1, 2]} gl={{ antialias: true }}>
      <ambientLight intensity={theme === 'dark' ? 0.9 : Math.PI * 0.8} />
      <directionalLight position={[-4, 6, 8]} intensity={theme === 'dark' ? 1.6 : 1.1} color="#f2f0ea" />
      <directionalLight position={[5, -2, -6]} intensity={0.7} color="#c9d4ff" />
      <Physics interpolate gravity={[0, -40, 0]} timeStep={1 / 60}>
        <Band data={data} theme={theme} />
      </Physics>
      <Environment blur={0.8}>
        <Lightformer intensity={theme === 'dark' ? 1.4 : 2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={theme === 'dark' ? 2.2 : 3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={theme === 'dark' ? 2.2 : 3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={theme === 'dark' ? 6 : 10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
        <Lightformer intensity={theme === 'dark' ? 1.5 : 0.6} color="#dfe6ff" position={[8, 4, -6]} rotation={[0, -Math.PI / 3, 0]} scale={[30, 3, 1]} />
      </Environment>
    </Canvas>
  );
}
