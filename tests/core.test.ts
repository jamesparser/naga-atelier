import { describe, expect, it } from 'vitest';
import { VoxelModel, key } from '../src/blocks/voxelModel';
import { BLUEPRINTS, planSpawn } from '../src/blueprints';
import { executeCommand } from '../src/agent/executor';
import { parseIntent } from '../shared/intent';
import { sanitizeCommand, sanitizeEnvelope, BLUEPRINT_IDS } from '../shared/protocol';

describe('protocol', () => {
  it('rejects unknown blueprint ids and types', () => {
    expect(sanitizeCommand({ v: 1, type: 'build', blueprintId: 'death_star' })).toBeNull();
    expect(sanitizeCommand({ v: 1, type: 'explode' })).toBeNull();
    expect(sanitizeCommand('nope')).toBeNull();
  });
  it('clamps scale and defaults anchor', () => {
    const c = sanitizeCommand({ type: 'build', blueprintId: 'tower', scale: 9 });
    expect(c).toMatchObject({ v: 1, type: 'build', blueprintId: 'tower', anchor: 'desk_center', scale: 2 });
  });
  it('envelope with null build is pure chat', () => {
    expect(sanitizeEnvelope({ speech: 'hi', build: null })).toEqual({ speech: 'hi', build: null });
    expect(sanitizeEnvelope({})).toBeNull();
  });
});

describe('intent parser', () => {
  const cases: Array<[string, Record<string, unknown> | null]> = [
    ['Build a small house on the desk', { type: 'build', blueprintId: 'house_small', anchor: 'desk_center' }],
    ['make the roof red', { type: 'color', color: 'roof_red', target: 'roof' }],
    ['Make it red', { type: 'color', color: 'roof_red', target: 'last' }],
    ['undo', { type: 'undo' }],
    ['oops go back', { type: 'undo' }],
    ['clear the desk', { type: 'clear' }],
    ['delete everything', { type: 'clear' }],
    ['export my desk', { type: 'export' }],
    ['save the world as html', { type: 'export' }],
    ['download this file', { type: 'export' }],
    ['detail grid', { type: 'grid', preset: 'detail' }],
    ['smaller blocks', { type: 'grid', preset: 'detail' }],
    ['24 by 24 blocks', { type: 'grid', preset: 'detail' }],
    ['big blocks', { type: 'grid', preset: 'draft' }],
    ['mosaic', { type: 'grid', preset: 'mosaic' }],
    ['a bit bigger', { type: 'scale', scale: 1.25 }],
    ['make it smaller', { type: 'scale', scale: 0.8 }],
    ['build a tower on the left', { type: 'build', blueprintId: 'tower', anchor: 'desk_left' }],
    ['build a red tower', { type: 'build', blueprintId: 'tower', color: 'roof_red' }],
    ['give me some stairs', { type: 'build', blueprintId: 'stairs' }],
    ['a garden please', { type: 'build', blueprintId: 'garden' }],
    ['make a fireplace', { type: 'build', blueprintId: 'fireplace' }],
    ['make the fire gold', { type: 'color', color: 'gold', target: 'fire' }],
    ['build a maze', { type: 'build', blueprintId: 'maze_tiny' }],
    ['put a bench on the right', { type: 'build', blueprintId: 'bench', anchor: 'desk_right' }],
    ['build an arch', { type: 'build', blueprintId: 'arch' }],
    ['add a shelf', { type: 'build', blueprintId: 'desk_shelf' }],
    ['build a wall', { type: 'build', blueprintId: 'wall' }],
    ['move it left', { type: 'move', dx: -0.08 }],
    ['rotate it', { type: 'rotate', turns: 1 }],
    ['paint the windows blue', { type: 'color', color: 'sky', target: 'windows' }],
    ["let's play tetris", { type: 'game', action: 'start' }],
    ['back to building', { type: 'game', action: 'stop' }],
    ['exit the game', { type: 'game', action: 'stop' }],
    ['drop', { type: 'game', action: 'drop' }],
    ['pause', { type: 'game', action: 'pause' }],
  ];
  for (const [text, want] of cases) {
    it(text, () => {
      const env = parseIntent(text);
      expect(env).not.toBeNull();
      expect(env!.build).toMatchObject(want!);
      expect(env!.speech.length).toBeGreaterThan(0);
      expect(env!.speech.split(' ').length).toBeLessThanOrEqual(12);
    });
  }
  it('chat without build', () => {
    expect(parseIntent('hello there')!.build).toBeNull();
    expect(parseIntent('what is the capital of France')).toBeNull();
  });
});

describe('blueprints', () => {
  it('has all 10 with valid voxels inside 50..400 (bench/wall smaller ok)', () => {
    for (const id of BLUEPRINT_IDS) {
      const bp = BLUEPRINTS[id];
      expect(bp.id).toBe(id);
      expect(bp.voxels.length).toBeGreaterThan(20);
      expect(bp.voxels.length).toBeLessThanOrEqual(400);
    }
  });
  it('every blueprint spawns fully on an empty desk at all anchors', () => {
    for (const id of BLUEPRINT_IDS) {
      for (const anchor of ['desk_center', 'desk_left', 'desk_right', 'floating'] as const) {
        const m = new VoxelModel();
        const p = planSpawn(m, BLUEPRINTS[id], { anchor });
        expect(p.clipped).toBe(false);
        expect(p.changes.length).toBe(BLUEPRINTS[id].voxels.length);
      }
    }
  });
  it('second spawn does not overlap the first', () => {
    const m = new VoxelModel();
    executeCommand(m, { v: 1, type: 'build', blueprintId: 'house_small' });
    const before = m.size;
    executeCommand(m, { v: 1, type: 'build', blueprintId: 'tower' });
    expect(m.size).toBe(before + BLUEPRINTS.tower.voxels.length);
  });
});

describe('model + executor (judge test loop)', () => {
  it('build → recolor roof → move roof → delete block → undo chain', () => {
    const m = new VoxelModel();
    expect(executeCommand(m, { v: 1, type: 'build', blueprintId: 'house_small' }).ok).toBe(true);
    const n = m.size;
    const roof = m.resolveTarget('roof');
    expect(roof.length).toBe(BLUEPRINTS.house_small.voxels.filter((v) => v.cl === 'roof').length);

    executeCommand(m, { v: 1, type: 'color', target: 'roof', color: 'gold' });
    expect(roof.every((k) => m.cells.get(k)!.c === 'gold')).toBe(true);

    // hand-style cluster move: lift by 0, shift +2 x
    const grp = m.keysInGroup(m.cells.get(roof[0])!.cl!);
    const mv = m.moveChanges(grp, [0, 1, 0]);
    expect(mv).not.toBeNull();
    m.commit('move', mv!);
    expect(m.size).toBe(n);

    const victim = [...m.cells.keys()][0];
    m.commit('delete', m.diff([[victim, null]]));
    expect(m.size).toBe(n - 1);

    m.undo(); // delete
    expect(m.size).toBe(n);
    m.undo(); // move
    expect(roof.every((k) => m.cells.has(k))).toBe(true);
    m.undo(); // color
    expect(roof.every((k) => m.cells.get(k)!.c === 'roof_red')).toBe(true);
    m.undo(); // build
    expect(m.size).toBe(0);
    m.redo();
    expect(m.size).toBe(n);
  });

  it('walls group includes windows and door', () => {
    const m = new VoxelModel();
    executeCommand(m, { v: 1, type: 'build', blueprintId: 'house_small' });
    const win = m.resolveTarget('windows');
    expect(win.length).toBeGreaterThan(0);
    const grp = m.keysInGroup(m.cells.get(win[0])!.cl!);
    expect(grp.length).toBe(BLUEPRINTS.house_small.voxels.filter((v) => v.cl?.startsWith('walls')).length);
    expect(grp.length).toBe(71);
  });

  it('move blocked by other blocks is refused', () => {
    const m = new VoxelModel();
    m.commit('a', m.diff([[key(0, 0, 0), { c: 'oak', cl: null }], [key(1, 0, 0), { c: 'oak', cl: null }]]));
    expect(m.moveChanges([key(0, 0, 0)], [1, 0, 0])).toBeNull();
    expect(m.moveChanges([key(0, 0, 0)], [0, -1, 0])).toBeNull();
    expect(m.moveChanges([key(0, 0, 0), key(1, 0, 0)], [1, 0, 0])).not.toBeNull();
  });

  it('undo stack is capped at 20', () => {
    const m = new VoxelModel();
    for (let i = 0; i < 30; i++) m.commit('p', m.diff([[key(i % 8, 0, 0), { c: (['oak', 'ink', 'gold'] as const)[i % 3], cl: null }]]));
    let u = 0;
    while (m.undo()) u++;
    expect(u).toBe(20);
  });

  it('scale + rotate + clear + json roundtrip', () => {
    const m = new VoxelModel();
    executeCommand(m, { v: 1, type: 'build', blueprintId: 'bench' });
    expect(executeCommand(m, { v: 1, type: 'scale', scale: 1.25, target: 'last' }).ok).toBe(true);
    expect(m.size).toBeGreaterThan(40);
    expect(executeCommand(m, { v: 1, type: 'rotate', turns: 1, target: 'last' }).ok).toBe(true);
    const j = JSON.parse(JSON.stringify(m.toJSON()));
    const m2 = new VoxelModel();
    expect(m2.load(j)).toBe(true);
    expect(m2.size).toBe(m.size);
    executeCommand(m, { v: 1, type: 'clear' });
    expect(m.size).toBe(0);
    m.undo();
    expect(m.size).toBe(m2.size);
  });
});
