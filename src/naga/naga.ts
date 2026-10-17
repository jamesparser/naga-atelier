/**
 * Naga: a small coiled-serpent orb that lives at the back-left of the desk, never over
 * the build area. It shows what the agent is doing (listening / thinking / speaking /
 * casting) and owns the caption panel, so the experience reads without sound.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { dotTexture } from '../fx/sparkles.js';

export type NagaMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'casting' | 'happy' | 'resting';

const MOOD_COLOR: Record<NagaMood, number> = {
  idle: 0x58d6c8,
  listening: 0xff6f6f,
  thinking: 0x9b7bff,
  speaking: 0x7fe0ff,
  casting: 0xffd166,
  happy: 0x8ff0a4,
  resting: 0x6b7a88,
};

const MOTES = 28;

/** A tube whose radius tapers smoothly to nothing at both ends (no cone tips). */
function taperedTube(curve: CatmullRomCurve3, segs: number, radius: number, radial = 10): TubeGeometry {
  const g = new TubeGeometry(curve, segs, radius, radial, false);
  const pos = g.attributes.position as BufferAttribute;
  const c = new Vector3(), v = new Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    // thick in the middle, fine at both ends, with a gentle swell like a serpent's body
    const k = Math.pow(Math.sin(Math.PI * t), 0.6) * (0.85 + 0.15 * Math.sin(t * 14));
    curve.getPointAt(t, c);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A soft pulse of light that travels along the coil (scrolled via texture offset). */
function flowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#202020');
  grad.addColorStop(0.42, '#303030');
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(0.58, '#303030');
  grad.addColorStop(1, '#202020');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 4);
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

export class Naga {
  readonly root = new Group();
  readonly caption: Caption;
  private heart: Mesh;
  private heartMat: MeshStandardMaterial;
  private shell: Mesh;
  private shellMat: MeshStandardMaterial;
  private halo: Mesh;
  private haloMat: MeshBasicMaterial;
  private ring: Mesh;
  private ringMat: MeshBasicMaterial;
  private coil = new Group();
  private coilMat: MeshStandardMaterial;
  private flow: CanvasTexture;
  private motes: Points;
  private moteMat: PointsMaterial;
  private motePos = new Float32Array(MOTES * 3);
  private mood: NagaMood = 'idle';
  private moodUntil = 0;
  private pop = 0;
  private level = 0;
  readonly home = new Vector3(-0.42, 0.17, -0.17);

  constructor() {
    this.root.position.copy(this.home);
    // faceted glowing heart inside a smoky glass shell
    this.heartMat = new MeshStandardMaterial({ color: 0x0a2a28, emissive: MOOD_COLOR.idle, emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.3, flatShading: true });
    this.heart = new Mesh(new IcosahedronGeometry(0.017, 0), this.heartMat);
    this.shellMat = new MeshStandardMaterial({ color: 0x163a44, emissive: MOOD_COLOR.idle, emissiveIntensity: 0.18, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.42, depthWrite: false });
    this.shell = new Mesh(new SphereGeometry(0.031, 32, 20), this.shellMat);
    this.haloMat = new MeshBasicMaterial({ color: MOOD_COLOR.idle, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false });
    this.halo = new Mesh(new SphereGeometry(0.05, 24, 16), this.haloMat);
    // a thin orbit ring that tilts toward you when listening
    this.ringMat = new MeshBasicMaterial({ color: MOOD_COLOR.idle, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false });
    this.ring = new Mesh(new TorusGeometry(0.041, 0.0011, 6, 64), this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.root.add(this.halo, this.shell, this.heart, this.ring, this.coil);

    // Serpent body: a tapered helix of light wrapped around the orb (both ends fade to a point).
    const pts: Vector3[] = [];
    const turns = 1.75;
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const a = t * Math.PI * 2 * turns;
      const r = 0.049 + 0.005 * Math.sin(t * 9);
      pts.push(new Vector3(Math.cos(a) * r, -0.038 + t * 0.076 + 0.004 * Math.sin(t * 20), Math.sin(a) * r));
    }
    const curve = new CatmullRomCurve3(pts);
    this.flow = flowTexture();
    this.coilMat = new MeshStandardMaterial({ color: 0x0f5a52, emissive: MOOD_COLOR.idle, emissiveMap: this.flow, emissiveIntensity: 1.4, roughness: 0.35, metalness: 0.4 });
    const body = new Mesh(taperedTube(curve, 160, 0.0068), this.coilMat);
    this.coil.add(body);

    // motes orbiting the orb
    const mg = new BufferGeometry();
    mg.setAttribute('position', new BufferAttribute(this.motePos, 3));
    this.moteMat = new PointsMaterial({ size: 0.006, map: dotTexture(), color: MOOD_COLOR.idle, transparent: true, depthWrite: false, blending: AdditiveBlending });
    this.motes = new Points(mg, this.moteMat);
    this.motes.frustumCulled = false;
    this.root.add(this.motes);

    this.caption = new Caption();
    this.caption.mesh.position.set(0, 0.29, -0.30);
    this.caption.mesh.rotation.x = -0.18;
  }

  setMood(m: NagaMood, holdMs = 0, now = performance.now()): void {
    if (m === 'casting' || m === 'happy') this.pop = 1;
    this.mood = m;
    this.moodUntil = holdMs ? now + holdMs : 0;
  }
  get currentMood(): NagaMood {
    return this.mood;
  }
  /** 0..1 audio level while speaking/listening. */
  setLevel(v: number): void {
    this.level = v;
  }

  update(now: number, dt: number): void {
    if (this.moodUntil && now > this.moodUntil) {
      this.moodUntil = 0;
      this.mood = 'idle';
    }
    const target = tmpColor(MOOD_COLOR[this.mood]);
    const k = Math.min(1, dt * 8);
    for (const c of [this.heartMat.emissive, this.shellMat.emissive, this.haloMat.color, this.ringMat.color, this.coilMat.emissive, this.moteMat.color]) c.lerp(target, k);
    const speedBy: Record<NagaMood, number> = { idle: 0.25, listening: 0.6, thinking: 1.6, speaking: 0.5, casting: 2.8, happy: 0.9, resting: 0.08 };
    const sp = speedBy[this.mood];
    this.coil.rotation.y += dt * sp;
    this.flow.offset.x -= dt * (0.12 + sp * 0.2); // light runs slowly up the serpent
    this.heart.rotation.x += dt * (0.15 + sp * 0.3);
    this.heart.rotation.y += dt * (0.3 + sp * 0.5);
    // the ring tilts toward you while listening and spins while thinking
    const tilt = this.mood === 'listening' ? 0.9 : this.mood === 'thinking' ? 0.35 : 0;
    this.ring.rotation.x += (Math.PI / 2 - tilt - this.ring.rotation.x) * k;
    this.ring.rotation.z += dt * (this.mood === 'thinking' ? 1.6 : 0.2);
    this.pop = Math.max(0, this.pop - dt * 2.5);
    const breathe = 1 + 0.04 * Math.sin(now / 1100);
    const talk = this.mood === 'speaking' || this.mood === 'listening' ? this.level * 0.25 : 0;
    const s = breathe + talk + this.pop * 0.35;
    this.heart.scale.setScalar(s * (1 + talk * 0.8));
    this.shell.scale.setScalar(breathe + this.pop * 0.2);
    this.halo.scale.setScalar(s * (1.1 + 0.12 * Math.sin(now / 700)));
    this.ring.scale.setScalar(1 + this.pop * 0.25 + talk * 0.2);
    this.haloMat.opacity = this.mood === 'resting' ? 0.05 : 0.14 + talk * 0.5 + this.pop * 0.3;
    this.coilMat.emissiveIntensity = this.mood === 'resting' ? 0.4 : 1.3 + talk * 2 + this.pop;
    for (let i = 0; i < MOTES; i++) {
      const a = now / 1000 * (0.25 + (i % 5) * 0.06) * (1 + sp * 0.3) + i * 2.39;
      const r = 0.058 + (i % 3) * 0.008 + this.pop * 0.03;
      const y = Math.sin(a * 0.7 + i) * 0.035;
      this.motePos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    }
    (this.motes.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    this.moteMat.opacity = this.mood === 'resting' ? 0.2 : 0.75;
    this.root.position.y = this.home.y + 0.008 * Math.sin(now / 1600);
    this.caption.update(now);
  }
}

const _c = new MeshBasicMaterial().color;
function tmpColor(hex: number) {
  return _c.setHex(hex);
}

/** Two-line caption: what the user said (dim) and what Naga says / asks (bright). */
export class Caption {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private mat: MeshBasicMaterial;
  private user = '';
  private naga = '';
  private hint = '';
  private fadeAt = 0;
  private dirty = true;

  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 300;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false });
    this.mesh = new Mesh(new PlaneGeometry(0.44, 0.44 * (300 / 1024)), this.mat);
    this.mesh.renderOrder = 20;
  }

  /** Persistent instruction line (onboarding). Empty string clears it. */
  setHint(text: string): void {
    if (text === this.hint) return;
    this.hint = text;
    this.dirty = true;
  }
  say(text: string, holdMs = 6500): void {
    this.naga = text;
    this.fadeAt = performance.now() + holdMs;
    this.dirty = true;
  }
  heard(text: string): void {
    this.user = text;
    this.dirty = true;
  }

  update(now: number): void {
    if (this.fadeAt && now > this.fadeAt) {
      this.fadeAt = 0;
      this.naga = '';
      this.user = '';
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    const main = this.naga || this.hint;
    this.mesh.visible = !!(main || this.user);
    if (!this.mesh.visible) return;
    g.fillStyle = 'rgba(10,18,28,0.72)';
    g.beginPath();
    g.roundRect(8, 8, W - 16, H - 16, 36);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let y = 64;
    if (this.user) {
      g.font = '500 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillStyle = '#9fb3c8';
      g.fillText(clip(g, `“${this.user}”`, W - 80), W / 2, y);
      y += 58;
    }
    if (main) {
      g.font = '600 52px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillStyle = this.naga ? '#eafcff' : '#ffe6a8';
      const lines = wrap(g, main, W - 90).slice(0, this.user ? 2 : 3);
      const startY = this.user ? y + 10 : H / 2 - ((lines.length - 1) * 64) / 2;
      lines.forEach((l, i) => g.fillText(l, W / 2, startY + i * 64));
    }
    this.tex.needsUpdate = true;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function clip(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 4 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
