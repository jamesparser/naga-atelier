/**
 * Neon stage for Tetris mode: a retro-futurist vector tunnel behind the well, a warp starfield,
 * glowing hue-cycling edges and a dimming dome so the colours pop over passthrough.
 * Everything is a handful of line / point draw calls.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { dotTexture } from '../fx/sparkles.js';

const RINGS = 16;
const DEPTH = 2.6; // metres the tunnel recedes behind the well
const STARS = 420;

/** Neon block texture: dark glassy face, bright glowing rim. Tinted per instance. */
let neonTex: CanvasTexture | null = null;
export function neonTexture(): CanvasTexture {
  if (neonTex) return neonTex;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(0, 0, s, s);
  // inner glow
  const grd = g.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.72);
  grd.addColorStop(0, 'rgba(255,255,255,0.05)');
  grd.addColorStop(1, 'rgba(255,255,255,0.55)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  // bright rim
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(255,255,255,${1 - i * 0.11})`;
    g.lineWidth = 1.5;
    g.strokeRect(i + 0.5, i + 0.5, s - 2 * i - 1, s - 2 * i - 1);
  }
  // corner sparks
  g.fillStyle = '#ffffff';
  for (const [x, y] of [[4, 4], [s - 4, 4], [4, s - 4], [s - 4, s - 4]]) {
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
  }
  neonTex = new CanvasTexture(c);
  neonTex.colorSpace = SRGBColorSpace;
  return neonTex;
}

export function neonMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ map: neonTexture(), transparent: true, depthWrite: true, alphaTest: 0.02 });
}

export class NeonStage {
  readonly root = new Group();
  private tunnelGeo = new BufferGeometry();
  private tunnelPos: Float32Array;
  private tunnelCol: Float32Array;
  private starGeo = new BufferGeometry();
  private starPos = new Float32Array(STARS * 3);
  private starCol = new Float32Array(STARS * 3);
  private starVel = new Float32Array(STARS);
  private dome: Mesh;
  private flash = 0;
  private warp = 0;
  private phase = 0;
  private hue = 0;
  private perim: Array<[number, number]>;
  readonly tint = new Color();

  /** The well's front opening (desk-local metres): x in [x0,x1], y in [0,h], back plane at zBack. */
  constructor(private x0: number, private x1: number, private h: number, private zBack: number) {
    this.root.name = 'neon';
    // perimeter of the tunnel cross-section with lane ticks (a vector web like an arcade tube shooter)
    const lanes = 10;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= lanes; i++) pts.push([x0 + ((x1 - x0) * i) / lanes, 0]);
    for (let i = 1; i <= 7; i++) pts.push([x1, (h * i) / 7]);
    for (let i = lanes - 1; i >= 0; i--) pts.push([x0 + ((x1 - x0) * i) / lanes, h]);
    for (let i = 6; i >= 1; i--) pts.push([x0, (h * i) / 7]);
    this.perim = pts;
    const n = pts.length;
    // segments: rings (n per ring) + lanes (n per gap between ring 0 and vanishing point)
    const segs = RINGS * n + n;
    this.tunnelPos = new Float32Array(segs * 6);
    this.tunnelCol = new Float32Array(segs * 6);
    this.tunnelGeo.setAttribute('position', new BufferAttribute(this.tunnelPos, 3));
    this.tunnelGeo.setAttribute('color', new BufferAttribute(this.tunnelCol, 3));
    const tunnel = new LineSegments(
      this.tunnelGeo,
      new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }),
    );
    tunnel.frustumCulled = false;

    // warp starfield flying out of the tunnel toward the player
    for (let i = 0; i < STARS; i++) this.resetStar(i, true);
    this.starGeo.setAttribute('position', new BufferAttribute(this.starPos, 3));
    this.starGeo.setAttribute('color', new BufferAttribute(this.starCol, 3));
    const stars = new Points(
      this.starGeo,
      new PointsMaterial({ size: 0.008, map: dotTexture(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true }),
    );
    stars.frustumCulled = false;

    // dim the room so neon reads over passthrough (still see your hands)
    this.dome = new Mesh(
      new SphereGeometry(3.2, 32, 16),
      new MeshBasicMaterial({ color: 0x05000f, side: BackSide, transparent: true, opacity: 0.62, depthWrite: false }),
    );
    this.dome.renderOrder = -10;
    this.root.add(this.dome, tunnel, stars);
  }

  private resetStar(i: number, anywhere = false): void {
    const cx = (this.x0 + this.x1) / 2, cy = this.h / 2;
    const a = Math.random() * Math.PI * 2;
    const r = 0.05 + Math.random() * 0.9;
    const z = anywhere ? this.zBack - Math.random() * DEPTH * 1.6 : this.zBack - DEPTH * (1.2 + Math.random() * 0.4);
    this.starPos.set([cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r, z], i * 3);
    this.starVel[i] = 0.4 + Math.random() * 0.9;
  }

  /** big hit: white flash + warp burst */
  pulse(strength = 1): void {
    this.flash = Math.min(1.5, this.flash + 0.8 * strength);
    this.warp = Math.min(3, this.warp + 2 * strength);
  }

  setPassthrough(on: boolean): void {
    (this.dome.material as MeshBasicMaterial).opacity = on ? 0.62 : 0.92;
  }

  update(now: number, dt: number, level: number, danger: boolean): void {
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.warp = Math.max(0, this.warp - dt * 1.4);
    const speed = 0.25 + level * 0.06 + this.warp * 0.6;
    this.phase = (this.phase + dt * speed) % 1;
    this.hue = (this.hue + dt * (0.04 + level * 0.008 + this.warp * 0.05)) % 1;
    this.tint.setHSL(this.hue, 0.85, 0.6);

    // --- tunnel geometry -----------------------------------------------------
    const cx = (this.x0 + this.x1) / 2, cy = this.h / 2;
    const n = this.perim.length;
    let o = 0;
    const c = new Color();
    const put = (x: number, y: number, z: number, col: Color) => {
      this.tunnelPos[o] = x; this.tunnelPos[o + 1] = y; this.tunnelPos[o + 2] = z;
      this.tunnelCol[o] = col.r; this.tunnelCol[o + 1] = col.g; this.tunnelCol[o + 2] = col.b;
      o += 3;
    };
    const proj = (px: number, py: number, depth01: number): [number, number, number] => {
      // perspective shrink toward a vanishing point far behind the well
      const k = 1 / (1 + depth01 * 5.5);
      return [cx + (px - cx) * k, cy * 0.6 + (py - cy * 0.6) * k, this.zBack - depth01 * DEPTH];
    };
    for (let r = 0; r < RINGS; r++) {
      const d = (r + 1 - this.phase) / RINGS; // 0 (near) .. 1 (far), flowing toward you
      const fade = Math.pow(1 - d, 1.4) * (1 + this.flash);
      c.setHSL((this.hue + d * 0.6) % 1, 1, 0.55).multiplyScalar(fade);
      if (danger) c.lerp(new Color(1, 0.15, 0.2).multiplyScalar(fade), 0.6 + 0.4 * Math.sin(now / 110));
      for (let i = 0; i < n; i++) {
        const [ax, ay] = this.perim[i], [bx, by] = this.perim[(i + 1) % n];
        const a = proj(ax, ay, d), b = proj(bx, by, d);
        put(a[0], a[1], a[2], c);
        put(b[0], b[1], b[2], c);
      }
    }
    for (let i = 0; i < n; i++) {
      const [px, py] = this.perim[i];
      const a = proj(px, py, 0), b = proj(px, py, 1);
      c.setHSL((this.hue + 0.5 + i / n * 0.3) % 1, 1, 0.5).multiplyScalar(0.55 + this.flash * 0.6);
      put(a[0], a[1], a[2], c);
      c.multiplyScalar(0.05);
      put(b[0], b[1], b[2], c);
    }
    this.tunnelGeo.attributes.position.needsUpdate = true;
    this.tunnelGeo.attributes.color.needsUpdate = true;

    // --- stars ---------------------------------------------------------------
    const zNear = this.zBack + 0.9;
    for (let i = 0; i < STARS; i++) {
      const j = i * 3;
      this.starPos[j + 2] += this.starVel[i] * dt * (0.6 + speed * 2.2);
      if (this.starPos[j + 2] > zNear) this.resetStar(i);
      const t = 1 - Math.min(1, (zNear - this.starPos[j + 2]) / (DEPTH * 1.6));
      c.setHSL((this.hue + i * 0.013) % 1, 0.7, 0.6 + 0.3 * t).multiplyScalar(0.3 + t);
      this.starCol[j] = c.r; this.starCol[j + 1] = c.g; this.starCol[j + 2] = c.b;
    }
    this.starGeo.attributes.position.needsUpdate = true;
    this.starGeo.attributes.color.needsUpdate = true;
  }

  get flashLevel(): number {
    return this.flash;
  }
}
