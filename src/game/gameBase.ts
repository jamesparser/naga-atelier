/**
 * Shared plumbing for the arcade games: a dock of labelled buttons, a score panel, an in-headset
 * help card, and pinch/poke/hover handling for every pointer (hands, controllers, mouse/touch).
 */
import { CanvasTexture, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Ray, SRGBColorSpace, Vector3, type Object3D } from 'three';
import { Dock, type DockAction } from '../ui/dock.js';
import { SynthMusic, type StyleId } from '../audio/music.js';
import { sfx } from '../audio/sfx.js';
import { helpCard } from '../ui/helpCard.js';
import type { PadLayout } from '../ui/screenPad.js';
import type { Pointer } from '../hands/handInput.js';

export interface GameHost {
  say(text: string): void;
  celebrate(): void;
  exit(): void;
  mic(): void;
  passthrough?(): boolean;
  /** viewer (head / desktop camera) position in world space */
  eye?(): Vector3;
  /** comfort vignette strength 0..1 for first-person games (darkens the edges of your view) */
  comfort?(level: number): void;
  /** latest desktop mouse ray in world space (null in the headset) */
  mouseRay?(): Ray | null;
}

/** Default seated eye position in desk-local metres (DESK_BELOW_HEAD above, DESK_FORWARD in front). */
export const DEFAULT_EYE = new Vector3(0, 0.45, 0.5);

export interface PointerFrame {
  p: Pointer;
  /** pinch point in desk-local metres */
  local: Vector3;
  down: boolean;
  up: boolean;
  /** true for the first ~120 ms of a pinch, while the fingers are still closing (the point drifts) */
  settling: boolean;
}

export const SETTLE_MS = 120;

export abstract class GameBase {
  readonly root = new Group();
  readonly dock: Dock;
  /** more button sets (e.g. the arcade tiles) that get the same poke / pinch handling */
  protected extraDocks: Dock[] = [];
  /** first-person games: the desk decor hides and the desktop camera moves to the eye */
  readonly firstPerson: boolean = false;
  protected panelMesh: Mesh;
  protected helpMesh: Object3D;
  /** each game has its own theme tune; it plays while musicOn() is true */
  protected music: SynthMusic | null;
  private musicLevel = 0;
  active = false;
  /** recent pointer events, for tests */
  readonly events: string[] = [];
  private wasPinching = new Map<number, boolean>();
  private downAt = new Map<number, number>();
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
    musicStyle?: StyleId,
  ) {
    this.music = musicStyle ? new SynthMusic(musicStyle) : null;
    this.root.visible = false;
    deskRoot.add(this.root);
    this.dock = new Dock(layout);
    this.root.add(this.dock.root);
    // score panel (right) + how-to card (left)
    this.panelCanvas.width = 512;
    this.panelCanvas.height = 384;
    this.panelTex = new CanvasTexture(this.panelCanvas);
    this.panelTex.colorSpace = SRGBColorSpace;
    const panel = (this.panelMesh = new Mesh(new PlaneGeometry(0.18, 0.135), new MeshBasicMaterial({ map: this.panelTex, transparent: true, depthWrite: false })));
    panel.position.set(0.36, 0.2, -0.1);
    panel.rotation.y = -0.45;
    panel.renderOrder = 12;
    this.root.add(panel);
    const card = helpCard('How to play', pad.help.filter((h) => h.head.startsWith('Quest')).map((h) => ({ head: h.head.replace('Quest — ', ''), lines: h.lines })), 0.17);
    this.helpMesh = card;
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
    this.music?.stop();
    sfx.stopLoops();
    this.stop();
  }

  /** Override: music plays while this is true (e.g. not paused / game over). */
  protected musicOn(): boolean {
    return true;
  }
  /** Override: tempo level for the music (rises with waves / levels). */
  protected musicTempo(): number {
    return 1;
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
    if (this.music) {
      const on = this.musicOn();
      if (on && !this.music.playing) this.music.start(sfx.ctx, this.musicTempo());
      else if (!on && this.music.playing) this.music.stop();
      const lv = this.musicTempo();
      if (lv !== this.musicLevel) {
        this.musicLevel = lv;
        this.music.setLevel(lv);
      }
    }
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
      if (down || up) {
        this.events.push(`${down ? "down" : "up"}:${p.id}:${p.active ? "a" : "i"}:${p.strength.toFixed(2)}:${Math.round(now)}`);
        if (this.events.length > 20) this.events.shift();
      }
      if (down) {
        let hitDock: Dock | null = null;
        let hit: DockAction | null = null;
        for (const d of [this.dock, ...this.extraDocks]) {
          if (!d.root.visible) continue;
          hit = d.hitTest(local, 0.012);
          if (hit) { hitDock = d; break; }
        }
        if (hit && hitDock) {
          hitDock.flash(hit, now);
          this.events.push(`dock:${hit}`);
          this.action(hit);
          this.wasPinching.set(p.id, true);
          continue;
        }
      }
      if (p.indexTip && !p.pinching && p.kind !== 'mouse') tips.set(p.id, this.deskRoot.worldToLocal(p.indexTip.clone()));
      if (down) this.downAt.set(p.id, now);
      frames.push({ p, local, down, up, settling: pinching && now - (this.downAt.get(p.id) ?? -1e9) < SETTLE_MS });
    }
    for (const d of [this.dock, ...this.extraDocks]) if (d.root.visible) for (const a of d.updatePokes(tips, now, hover)) this.action(a);
    this.tick(frames, now, dt);
  }

  /** Viewer eye in desk-local metres. */
  protected eyeLocal(out = new Vector3()): Vector3 {
    const e = this.host.eye?.();
    return e ? this.deskRoot.worldToLocal(out.copy(e)) : out.copy(DEFAULT_EYE);
  }

  /** Desktop mouse ray in desk-local space (null in the headset / no mouse). */
  protected mouseRayLocal(): Ray | null {
    const r = this.host.mouseRay?.();
    if (!r) return null;
    const inv = new Matrix4().copy(this.deskRoot.matrixWorld).invert();
    return r.clone().applyMatrix4(inv);
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
