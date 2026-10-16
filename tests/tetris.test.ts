import { describe, expect, it } from 'vitest';
import { Tetris3D, WELL_W, WELL_D, WELL_H, rotateCells, PIECES, type V3 } from '../src/game/tetris';

describe('tetris 3d', () => {
  it('spawns a piece at the top centre and it falls with time', () => {
    const g = new Tetris3D(1);
    g.start();
    expect(g.state).toBe('playing');
    const y0 = g.piece!.pos[1];
    g.step(g.fallInterval * 3 + 1);
    expect(g.piece!.pos[1]).toBe(y0 - 3);
  });

  it('four rotations about any axis return to the original shape', () => {
    for (const p of PIECES)
      for (const axis of ['x', 'y', 'z'] as const) {
        let c = p.cells;
        for (let i = 0; i < 4; i++) c = rotateCells(c, axis, 1);
        expect(c).toEqual(p.cells.map(([x, y, z]) => [x + 0, y + 0, z + 0]));
      }
  });

  it('walls block movement; rotation kicks off walls', () => {
    const g = new Tetris3D(2);
    g.start();
    g.setPiece('I', [2, 8, 0]);
    expect(g.move(-1, 0, 0)).toBe(true);
    expect(g.move(-1, 0, 0)).toBe(false); // cell -1 at x=-1 would be outside
    expect(g.move(0, 0, -1)).toBe(false); // already at z=0
    expect(g.rotate('y', 1)).toBe(true); // I turns into the depth axis, kicked inside the well
    for (const [x, , z] of g.pieceCells()) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThan(WELL_D);
    }
  });

  it('hard drop locks on the floor and spawns the next piece', () => {
    const g = new Tetris3D(3);
    g.start();
    const first = g.piece!.def.name;
    g.hardDrop();
    expect(g.board.size).toBe(4);
    expect([...g.board.keys()].every((k) => Number(k.split(',')[1]) <= 1)).toBe(true);
    expect(g.piece).not.toBeNull();
    expect(first).toBeTruthy();
  });

  it('a full straight row clears, blocks above in that slice fall, score goes up', () => {
    const g = new Tetris3D(4);
    g.start();
    const events: string[] = [];
    g.on((e) => events.push(e.type));
    // fill row y=0,z=0 except x=0..3, plus a marker block above at (5,1,0) and another slice untouched
    const cells: Array<[V3, 'stone']> = [];
    for (let x = 4; x < WELL_W; x++) cells.push([[x, 0, 0], 'stone']);
    cells.push([[5, 1, 0], 'stone'], [[5, 0, 2], 'stone']);
    g.setCells(cells);
    g.setPiece('I', [1, 3, 0]); // covers x=0..3 at z=0
    g.hardDrop();
    expect(events).toContain('clear');
    expect(g.lines).toBe(1);
    expect(g.board.has('5,0,0')).toBe(true); // marker fell from y=1 to y=0
    expect(g.board.has('5,1,0')).toBe(false);
    expect(g.board.has('5,0,2')).toBe(true); // other depth slice untouched
    expect(g.score).toBeGreaterThanOrEqual(100);
  });

  it('a full layer gives the layer bonus', () => {
    const g = new Tetris3D(5);
    g.start();
    const cells: Array<[V3, 'stone']> = [];
    for (let z = 0; z < WELL_D; z++) for (let x = 0; x < WELL_W; x++) if (!(z === 0 && x < 4)) cells.push([[x, 0, z], 'stone']);
    g.setCells(cells);
    let layers = -1;
    g.on((e) => { if (e.type === 'clear') layers = e.layers.length; });
    g.setPiece('I', [1, 5, 0]);
    g.hardDrop();
    expect(layers).toBe(1);
    expect(g.lines).toBe(WELL_D);
    expect(g.score).toBeGreaterThan(1000);
  });

  it('game over when the stack reaches the top', () => {
    const g = new Tetris3D(6);
    g.start();
    let over = false;
    g.on((e) => { if (e.type === 'gameover') over = true; });
    for (let i = 0; i < 200 && g.state === 'playing'; i++) g.hardDrop();
    expect(over).toBe(true);
    expect(g.state).toBe('over');
    expect([...g.board.keys()].some((k) => Number(k.split(',')[1]) >= WELL_H - 4)).toBe(true);
  });

  it('7-bag gives every piece once per 7 spawns', () => {
    const g = new Tetris3D(7);
    g.start();
    const seen = new Set<string>([g.piece!.def.name]);
    for (let i = 0; i < 6; i++) { g.board.clear(); g.hardDrop(); seen.add(g.piece!.def.name); }
    expect(seen.size).toBe(7);
  });
});
