/**
 * Arcade picker: big labelled tiles on the desk, one per mini-game. Poke, pinch, click or press 1–7.
 */
import { Mesh, MeshBasicMaterial, PlaneGeometry, CanvasTexture, SRGBColorSpace, type Object3D } from 'three';
import { ARCADE_LAYOUT, ARCADE_TILES, Dock, DOCK_LABELS, type DockAction } from '../ui/dock.js';
import { ARCADE_PAD } from '../ui/screenPad.js';
import { GameBase, type GameHost, type PointerFrame } from './gameBase.js';

export const ARCADE_GAMES = ['galago', 'maze', 'whack', 'breakout', 'tower', 'fappy', 'penguin'] as const;
export type ArcadeId = (typeof ARCADE_GAMES)[number];

const BLURB: Record<ArcadeId, string> = {
  galago: 'Space shooter: blast the diving swarm',
  maze: 'Tilt the board, roll the marble home',
  whack: 'Bop the gloomlings before they hide',
  breakout: '3D brick breaker with a hand paddle',
  tower: 'Pull blocks out, stack them on top',
  fappy: 'First person: flap through the gaps',
  penguin: 'First person: race across the ice',
};

export class ArcadePicker extends GameBase {
  private tiles: Dock;
  private sign: Mesh;

  constructor(deskRoot: Object3D, host: GameHost, private pick: (id: ArcadeId) => void) {
    super(deskRoot, host, ARCADE_LAYOUT, ARCADE_PAD, 'naga-atelier:arcade:v1', 'arcade');
    this.tiles = new Dock(ARCADE_TILES, undefined, { cols: 4, dx: 0.11, dz: 0.12, z0: -0.1 });
    this.root.add(this.tiles.root);
    this.extraDocks.push(this.tiles);
    // standing sign behind the tiles listing what each game is
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(10,18,28,0.82)';
    g.beginPath();
    g.roundRect(8, 8, 1008, 496, 40);
    g.fill();
    g.fillStyle = '#ffd166';
    g.font = '800 64px system-ui, sans-serif';
    g.fillText('ARCADE', 44, 92);
    g.font = '600 30px system-ui, sans-serif';
    g.fillStyle = '#9fb3c8';
    g.fillText('Poke or pinch a tile · keys 1–7 · say “play galago”', 330, 88);
    ARCADE_GAMES.forEach((id, i) => {
      const y = 160 + i * 48;
      g.fillStyle = '#eafcff';
      g.font = '800 32px system-ui, sans-serif';
      g.fillText(`${i + 1}  ${DOCK_LABELS[id]?.[0] ?? id}`, 44, y);
      g.fillStyle = '#9fb3c8';
      g.font = '500 30px system-ui, sans-serif';
      g.fillText(BLURB[id], 420, y);
    });
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    this.sign = new Mesh(new PlaneGeometry(0.44, 0.22), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.sign.position.set(0, 0.3, -0.34);
    this.sign.rotation.x = -0.15;
    this.root.add(this.sign);
    this.panelMesh.visible = false;
    this.helpMesh.visible = false;
  }

  protected start(): void {
    this.host.say('Arcade! Pick a game: poke a tile.');
  }

  action(id: string): void {
    if (id === 'exit') return this.host.exit();
    if (id === 'mic') return this.host.mic();
    if ((ARCADE_GAMES as readonly string[]).includes(id)) this.pick(id as ArcadeId);
  }

  key(k: string): boolean {
    const n = Number(k);
    if (n >= 1 && n <= ARCADE_GAMES.length) {
      this.pick(ARCADE_GAMES[n - 1]);
      return true;
    }
    if (k === 'Escape') {
      this.host.exit();
      return true;
    }
    return false;
  }

  protected tick(_frames: PointerFrame[], _now: number, _dt: number): void {
    /* tiles are handled by GameBase */
  }

  /** world position of a tile's top, for e2e pokes */
  debugTileWorld(id: DockAction): number[] | null {
    const p = this.tiles.buttonPos(id);
    return p ? this.deskRoot.localToWorld(p.setY(0.012)).toArray() : null;
  }

  tileIds(): DockAction[] {
    return ARCADE_TILES.map(([id]) => id);
  }
}
