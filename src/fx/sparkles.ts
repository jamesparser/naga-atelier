/**
 * Pooled sparkle particles + expanding shock rings. One Points draw call for all sparkles.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  Vector3,
  type Object3D,
} from 'three';

const MAX = 1400;

let dotTex: CanvasTexture | null = null;
export function dotTexture(): CanvasTexture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  // four-point star glint
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(32, 2); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(62, 32);
  g.stroke();
  dotTex = new CanvasTexture(c);
  return dotTex;
}

export class Sparkles {
  readonly group = new Group();
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private base = new Float32Array(MAX * 3);
  private geo = new BufferGeometry();
  private next = 0;
  private alive = 0;
  private rings: Array<{ mesh: Mesh; t: number; dur: number; max: number }> = [];

  constructor(parent: Object3D) {
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 3));
    const mat = new PointsMaterial({
      size: 0.014,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    const pts = new Points(this.geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 15;
    this.group.add(pts);
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -1000;
    parent.add(this.group);
  }

  /** Burst of sparkles at a desk-local point. */
  burst(at: Vector3, color: number, count = 10, speed = 0.35): void {
    const c = new Color(color).lerp(new Color(0xffffff), 0.35);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.4 + Math.random() * 0.8);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([v * Math.sin(ph) * Math.cos(th), v * Math.abs(Math.cos(ph)) * 0.9 + 0.12, v * Math.sin(ph) * Math.sin(th)], i * 3);
      const tint = Math.random() < 0.3 ? 1 : 0;
      const r = tint ? 1 : c.r, g = tint ? 0.95 : c.g, b = tint ? 0.7 : c.b;
      this.base.set([r, g, b], i * 3);
      this.col.set([r, g, b], i * 3);
      this.maxLife[i] = this.life[i] = 0.55 + Math.random() * 0.6;
    }
    this.alive = MAX;
  }

  /** Flat ring that expands along a cleared row's height. */
  ring(at: Vector3, color: number, max = 0.35): void {
    const mesh = new Mesh(
      new RingGeometry(0.9, 1, 48),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(at);
    mesh.scale.setScalar(0.02);
    this.group.add(mesh);
    this.rings.push({ mesh, t: 0, dur: 0.6, max });
  }

  update(dt: number): void {
    if (this.alive) {
      let any = false;
      for (let i = 0; i < MAX; i++) {
        if (this.life[i] <= 0) continue;
        any = true;
        this.life[i] -= dt;
        const j = i * 3;
        if (this.life[i] <= 0) {
          this.pos[j + 1] = -1000;
          continue;
        }
        this.vel[j + 1] -= 0.55 * dt; // light gravity
        this.vel[j] *= 0.985; this.vel[j + 2] *= 0.985;
        this.pos[j] += this.vel[j] * dt;
        this.pos[j + 1] += this.vel[j + 1] * dt;
        this.pos[j + 2] += this.vel[j + 2] * dt;
        const k = this.life[i] / this.maxLife[i];
        const twinkle = 0.6 + 0.4 * Math.sin((this.maxLife[i] - this.life[i]) * 40 + i);
        this.col[j] = this.base[j] * k * twinkle;
        this.col[j + 1] = this.base[j + 1] * k * twinkle;
        this.col[j + 2] = this.base[j + 2] * k * twinkle;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      if (!any) this.alive = 0;
    }
    for (const r of this.rings) {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.mesh.scale.setScalar(0.02 + (r.max - 0.02) * (1 - Math.pow(1 - k, 3)));
      (r.mesh.material as MeshBasicMaterial).opacity = 0.8 * (1 - k);
    }
    this.rings = this.rings.filter((r) => {
      if (r.t < r.dur) return true;
      this.group.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as MeshBasicMaterial).dispose();
      return false;
    });
  }
}
