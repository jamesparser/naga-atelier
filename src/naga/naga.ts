/**
 * Naga: a small coiled-serpent orb that lives at the back-left of the desk, never over
 * the build area. It shows what the agent is doing (listening / thinking / speaking /
 * casting) and owns the caption panel, so the experience reads without sound.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  CatmullRomCurve3,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';

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

export class Naga {
  readonly root = new Group();
  readonly caption: Caption;
  private core: Mesh;
  private coreMat: MeshStandardMaterial;
  private halo: Mesh;
  private haloMat: MeshBasicMaterial;
  private coil = new Group();
  private mood: NagaMood = 'idle';
  private moodUntil = 0;
  private pop = 0;
  private level = 0;
  readonly home = new Vector3(-0.42, 0.17, -0.17);

  constructor() {
    this.root.position.copy(this.home);
    this.coreMat = new MeshStandardMaterial({ color: 0x0d3b3a, emissive: MOOD_COLOR.idle, emissiveIntensity: 0.9, roughness: 0.3 });
    this.core = new Mesh(new IcosahedronGeometry(0.032, 3), this.coreMat);
    this.haloMat = new MeshBasicMaterial({ color: MOOD_COLOR.idle, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false });
    this.halo = new Mesh(new SphereGeometry(0.05, 24, 16), this.haloMat);
    this.root.add(this.core, this.halo, this.coil);

    // Serpent body: a tapered helix wrapped around the orb, with a little head.
    const pts: Vector3[] = [];
    const turns = 1.6;
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const a = t * Math.PI * 2 * turns;
      const r = 0.05 + 0.006 * Math.sin(t * 9);
      pts.push(new Vector3(Math.cos(a) * r, -0.035 + t * 0.07, Math.sin(a) * r));
    }
    const curve = new CatmullRomCurve3(pts);
    const bodyMat = new MeshStandardMaterial({ color: 0x1f8f7f, emissive: 0x0b3d36, roughness: 0.45, metalness: 0.2 });
    const body = new Mesh(new TubeGeometry(curve, 96, 0.0065, 8, false), bodyMat);
    const head = new Mesh(new ConeGeometry(0.011, 0.024, 10), new MeshStandardMaterial({ color: 0xffd166, emissive: 0x5a4210, roughness: 0.4 }));
    const end = curve.getPoint(1), tan = curve.getTangent(1);
    head.position.copy(end);
    head.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), tan);
    this.coil.add(body, head);

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
    const target = MOOD_COLOR[this.mood];
    this.coreMat.emissive.lerp(tmpColor(target), Math.min(1, dt * 8));
    this.haloMat.color.lerp(tmpColor(target), Math.min(1, dt * 8));
    const speedBy: Record<NagaMood, number> = { idle: 0.6, listening: 1.4, thinking: 3.5, speaking: 1.2, casting: 6, happy: 2, resting: 0.15 };
    this.coil.rotation.y += dt * speedBy[this.mood];
    this.pop = Math.max(0, this.pop - dt * 2.5);
    const breathe = 1 + 0.04 * Math.sin(now / 600);
    const talk = this.mood === 'speaking' || this.mood === 'listening' ? this.level * 0.25 : 0;
    const s = breathe + talk + this.pop * 0.35;
    this.core.scale.setScalar(s);
    this.halo.scale.setScalar(s * (1.1 + 0.15 * Math.sin(now / 300)));
    this.haloMat.opacity = this.mood === 'resting' ? 0.06 : 0.16 + talk * 0.5 + this.pop * 0.3;
    this.root.position.y = this.home.y + 0.008 * Math.sin(now / 900);
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
