/**
 * Shared plumbing for the arcade games: a dock of labelled buttons, a score panel, an in-headset
 * help card, and pinch/poke/hover handling for every pointer (hands, controllers, mouse/touch).
 */
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D } from 'three';
import { Dock, type DockAction } from '../ui/dock.js';
import { helpCard } from '../ui/helpCard.js';
import type { PadLayout } from '../ui/screenPad.js';
import type { Pointer } from '../hands/handInput.js';

export interface GameHost {
  say(text: string): void;
  celebrate(): void;
  exit(): void;
  mic(): void;
  passthrough?(): boolean;
}

export interface PointerFrame {
  p: Pointer;
  /** pinch point in desk-local metres */
  local: Vector3;
  down: boolean;
  up: boolean;
}

export abstract class GameBase {
  readonly root = new Group();
  readonly dock: Dock;
  active = false;
  private wasPinching = new Map<number, boolean>();
  private panelCanvas = document.createElement('canvas');
  private panelTex: CanvasTexture;
  private panelSig = '';
  protected best = 0;

  constructor(
    protected deskRoot: Object3D,
    protected host: GameHost,
    layout: Array<[DockAction, number]>,
    readonly pad: PadLayout,
    private bestKey: string,
  ) {
    this.root.visible = false;
    deskRoot.add(this.root);
    this.dock = new Dock(layout);
    this.root.add(this.dock.root);
    // score panel (right) + how-to card (left)
    this.panelCanvas.width = 512;
    this.panelCanvas.height = 384;
    this.panelTex = new CanvasTexture(this.panelCanvas);
    this.panelTex.colorSpace = SRGBColorSpace;
    const panel = new Mesh(new PlaneGeometry(0.18, 0.135), new MeshBasicMaterial({ map: this.panelTex, transparent: true, depthWrite: false }));
    panel.position.set(0.36, 0.2, -0.1);
    panel.rotation.y = -0.45;
    panel.renderOrder = 12;
    this.root.add(panel);
    const card = helpCard('How to play', pad.help.filter((h) => h.head.startsWith('Quest')).map((h) => ({ head: h.head.replace('Quest — ', ''), lines: h.lines })), 0.17);
    card.position.set(-0.4, 0.2, 0.0);
    card.rotation.y = 0.5;
    this.root.add(card);
    try {
      this.best = Number(localStorage.getItem(bestKey) ?? 0) || 0;
    } catch {
      /* ignore */
    }
  }

  enter(): void {
    this.active = true;
    this.root.visible = true;
    this.panelSig = '';
    this.start();
  }

  exit(): void {
    this.active = false;
    this.root.visible = false;
    this.stop();
  }

  pausedByHost(): void {
    /* games without pause ignore this */
  }

  protected abstract start(): void;
  protected stop(): void {
    /* optional */
  }
  abstract action(id: string): void;
  abstract key(k: string): boolean;
  protected abstract tick(frames: PointerFrame[], now: number, dt: number): void;

  /** Per-frame entry: dock pokes/pinches first, then the game sees the rest. */
  update(pointers: Pointer[], now: number, dt: number): void {
    if (!this.active) return;
    const frames: PointerFrame[] = [];
    const tips = new Map<number, Vector3>();
    const hover: Vector3[] = [];
    for (const p of pointers) {
      const was = this.wasPinching.get(p.id) ?? false;
      const pinching = p.active && p.pinching;
      this.wasPinching.set(p.id, pinching);
      if (!p.active) continue;
      const local = this.deskRoot.worldToLocal(p.pinchPoint.clone());
      hover.push(local);
      const down = pinching && !was, up = !pinching && was;
      if (down) {
        const hit = this.dock.hitTest(local, 0.012);
        if (hit) {
          this.dock.flash(hit, now);
          this.action(hit);
          this.wasPinching.set(p.id, true);
          continue;
        }
      }
      if (p.indexTip && !p.pinching && p.kind !== 'mouse') tips.set(p.id, this.deskRoot.worldToLocal(p.indexTip.clone()));
      frames.push({ p, local, down, up });
    }
    for (const a of this.dock.updatePokes(tips, now, hover)) this.action(a);
    this.tick(frames, now, dt);
  }

  protected saveBest(score: number): boolean {
    if (score <= this.best) return false;
    this.best = score;
    try {
      localStorage.setItem(this.bestKey, String(score));
    } catch {
      /* ignore */
    }
    return true;
  }

  /** Draw the score panel; only redraws when the content changes. */
  protected panel(title: string, rows: Array<[string, string]>, banner = '', bannerColor = '#ffd166'): void {
    const sig = JSON.stringify([title, rows, banner]);
    if (sig === this.panelSig) return;
    this.panelSig = sig;
    const c = this.panelCanvas.getContext('2d')!;
    c.clearRect(0, 0, 512, 384);
    c.fillStyle = 'rgba(10,18,28,0.8)';
    c.beginPath();
    c.roundRect(8, 8, 496, 368, 36);
    c.fill();
    c.fillStyle = '#ffd166';
    c.font = '800 38px system-ui, sans-serif';
    c.fillText(title, 32, 60);
    rows.forEach(([k, v], i) => {
      const y = 120 + i * 62;
      c.fillStyle = '#9fb3c8';
      c.font = '600 30px system-ui, sans-serif';
      c.fillText(k, 32, y);
      c.fillStyle = '#eafcff';
      c.font = '800 46px system-ui, sans-serif';
      c.textAlign = 'right';
      c.fillText(v, 480, y + 4);
      c.textAlign = 'left';
    });
    if (banner) {
      c.fillStyle = bannerColor;
      c.font = '800 40px system-ui, sans-serif';
      c.fillText(banner, 32, 352);
    }
    this.panelTex.needsUpdate = true;
  }
}
