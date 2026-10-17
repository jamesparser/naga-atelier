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
    ['build me a bridge', { type: 'build', blueprintId: 'bridge' }],
    ['build me a car', { type: 'build', blueprintId: 'car' }],
    ['make a red sports car on the right', { type: 'build', blueprintId: 'car', anchor: 'desk_right', color: 'roof_red' }],
    ['a boat please', { type: 'build', blueprintId: 'boat' }],
    ['build a spaceship', { type: 'build', blueprintId: 'rocket' }],
    ['build a castle', { type: 'build', blueprintId: 'castle' }],
    ['build a lighthouse', { type: 'build', blueprintId: 'lighthouse' }],
    ['plant a tree', { type: 'build', blueprintId: 'tree' }],
    ['can you make a train', { type: 'build', blueprintId: 'train' }],
    ['build an airplane', { type: 'build', blueprintId: 'plane' }],
    ['build a robot', { type: 'build', blueprintId: 'robot' }],
    ['make me a puppy', { type: 'build', blueprintId: 'dog' }],
    ['build a snowman', { type: 'build', blueprintId: 'snowman' }],
    ['build a windmill', { type: 'build', blueprintId: 'windmill' }],
    ['build a pyramid', { type: 'build', blueprintId: 'pyramid' }],
    ['add a table', { type: 'build', blueprintId: 'table' }],
    ['add a chair', { type: 'build', blueprintId: 'chair' }],
    ['build a bed', { type: 'build', blueprintId: 'bed' }],
    ['build a tent', { type: 'build', blueprintId: 'tent' }],
    ['make a heart', { type: 'build', blueprintId: 'heart' }],
    ['paint the wheels gold', { type: 'color', color: 'gold', target: 'wheels' }],
    ['make the house red', { type: 'color', color: 'roof_red', target: 'house_small' }],
    ['make three more chairs', { type: 'duplicate', target: 'chair', count: 3 }],
    ['duplicate it', { type: 'duplicate', target: 'last', count: 1 }],
    ['copy the car', { type: 'duplicate', target: 'car' }],
    ['put two more chairs by the table', { type: 'duplicate', target: 'chair', count: 2 }],
    ['get rid of the chimney', { type: 'delete', target: 'chimney' }],
    ['remove the roof', { type: 'delete', target: 'roof' }],
    ['mirror it', { type: 'mirror', target: 'last' }],
    ['replace red with blue', { type: 'replace', fromColor: 'roof_red', color: 'sky' }],
    ['change all the green to gold', { type: 'replace', fromColor: 'grass', color: 'gold' }],
    ['write HELLO', { type: 'text', text: 'HELLO' }],
    ['spell team in red', { type: 'text', text: 'TEAM', color: 'roof_red' }],
    ['make a bar chart of 3, 7, 5 and 9', { type: 'chart', values: [3, 7, 5, 9] }],
    ['graph our sales 12 18 9', { type: 'chart', values: [12, 18, 9] }],
    ['sketch a floor plan with 3 rooms', { type: 'floorplan', rooms: 3 }],
    ['an office layout with five rooms', { type: 'floorplan', rooms: 5 }],
    ['how many blocks are there', { type: 'info', question: 'count' }],
    ["what's on my desk", { type: 'info', question: 'describe' }],
    ['how tall is the castle', { type: 'info', question: 'size', target: 'castle' }],
    ['save this as kitchen', { type: 'save', name: 'kitchen' }],
    ['load kitchen', { type: 'load', name: 'kitchen' }],
    ['list my saves', { type: 'info', question: 'saves' }],
    ['make the sail blue', { type: 'color', color: 'sky', target: 'sail' }],
    ['move it left', { type: 'move', dx: -0.08 }],
    ['rotate it', { type: 'rotate', turns: 1 }],
    ['paint the windows blue', { type: 'color', color: 'sky', target: 'windows' }],
    ["let's play tetris", { type: 'game', action: 'start' }],
    ['back to building', { type: 'game', action: 'stop' }],
    ['exit the game', { type: 'game', action: 'stop' }],
    ['drop', { type: 'game', action: 'drop' }],
    ['pause', { type: 'game', action: 'pause' }],
    ['play angry sling', { type: 'game', action: 'start', game: 'sling' }],
    ['play star swarm', { type: 'game', action: 'start', game: 'swarm' }],
    ["let's play marble maze", { type: 'game', action: 'start', game: 'maze' }],
    ['whack a gloom', { type: 'game', action: 'start', game: 'whack' }],
    ['play breakout', { type: 'game', action: 'start', game: 'breakout' }],
    ['play jenga', { type: 'game', action: 'start', game: 'tower' }],
    ['play flap bro', { type: 'game', action: 'start', game: 'flapbro' }],
    ['play flappy bird', { type: 'game', action: 'start', game: 'flapbro' }],
    ['mike penguin', { type: 'game', action: 'start', game: 'penguin' }],
    ['open the arcade', { type: 'game', action: 'start', game: 'arcade' }],
    ['next level', { type: 'game', action: 'next' }],
  ];
  it('"build a penguin" is a build request for the agent, not the penguin game', () => {
    expect(parseIntent('build a penguin')?.build?.type).not.toBe('game');
    expect(parseIntent('build a tower')?.build?.type).toBe('build');
  });
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

describe('sculpt (agent-composed shapes)', () => {
  const mug = {
    v: 1, type: 'sculpt', label: 'mug',
    boxes: [[0, 0, 0, 5, 1, 5, 'white', 'mug'], [0, 1, 0, 5, 4, 1, 'white', 'mug'], [5, 2, 2, 2, 1, 1, 'white', 'handle'], [1, 1, 1, 3, 3, 3, 'oak', 'coffee']],
  };
  it('sanitizes boxes, clamps sizes and drops junk', () => {
    const c = sanitizeCommand({ ...mug, boxes: [...mug.boxes, ['x', 1], [-5, 0, 0, 99, 99, 99, 'neon', 'Big Part!']] });
    expect(c?.type).toBe('sculpt');
    expect(c?.shape?.boxes.length).toBe(5);
    const last = c!.shape!.boxes[4];
    expect(last.slice(0, 6)).toEqual([0, 0, 0, 14, 15, 10]);
    expect(last[6]).toBe('stone');
    expect(last[7]).toBe('bigpart');
    expect(sanitizeCommand({ v: 1, type: 'sculpt', boxes: [] })).toBeNull();
  });
  it('accepts a nested shape object too', () => {
    expect(sanitizeCommand({ type: 'sculpt', shape: { label: 'cup', boxes: [[0, 0, 0, 2, 2, 2, 'sky', 'cup']] } })?.shape?.label).toBe('cup');
  });
  it('spawns as one grabbable group with named parts and undoes cleanly', () => {
    const m = new VoxelModel();
    const res = executeCommand(m, sanitizeCommand(mug)!);
    expect(res.ok).toBe(true);
    expect(m.size).toBeGreaterThan(40);
    const names = new Set([...m.cells.values()].map((c) => (c.cl ?? "").split(':')[1]));
    expect(names).toEqual(new Set(['mug', 'mug/handle', 'mug/coffee']));
    executeCommand(m, { v: 1, type: 'undo' });
    expect(m.size).toBe(0);
  });
  it('caps a huge shape at 600 cells', () => {
    const c = sanitizeCommand({ type: 'sculpt', label: 'block', boxes: [[0, 0, 0, 14, 15, 10, 'stone', 'block']] })!;
    const m = new VoxelModel();
    executeCommand(m, c);
    expect(m.size).toBeLessThanOrEqual(600);
  });
});

import { chartBlueprint, describeDesk, duplicateChanges, floorplanBlueprint, layoutText, measure, sceneSummary, textBlueprint } from '../src/agent/tools';

describe('desk tools', () => {
  const build = (m: VoxelModel, id: string, anchor: 'desk_left' | 'desk_center' | 'desk_right' = 'desk_center') =>
    executeCommand(m, sanitizeCommand({ type: 'build', blueprintId: id, anchor })!);
  it('duplicates an object into separate grabbable copies, one undo', () => {
    const m = new VoxelModel();
    build(m, 'chair', 'desk_left');
    const n0 = m.size;
    const r = executeCommand(m, sanitizeCommand({ type: 'duplicate', target: 'chair', count: 2 })!);
    expect(r.ok).toBe(true);
    expect(m.size).toBe(n0 * 3);
    expect(new Set([...m.cells.values()].map((c) => c.cl!.split(':')[0])).size).toBe(3);
    executeCommand(m, { v: 1, type: 'undo' });
    expect(m.size).toBe(n0);
  });
  it('reports only the copies that fit', () => {
    const m = new VoxelModel();
    build(m, 'castle');
    const d = duplicateChanges(m, [...m.cells.keys()], 6);
    expect(d.placed).toBeLessThan(6);
  });
  it('targets a whole object by what it is', () => {
    const m = new VoxelModel();
    build(m, 'house_small', 'desk_left');
    build(m, 'car', 'desk_right');
    const r = executeCommand(m, sanitizeCommand({ type: 'color', color: 'sky', target: 'house_small' })!);
    expect(r.ok).toBe(true);
    expect([...m.cells.values()].filter((c) => c.c === 'sky').length).toBe(185);
    expect(sceneSummary(m)).toContain('house_small');
    expect(sceneSummary(m)).toContain('car');
    expect(describeDesk(m)).toMatch(/2 things/);
  });
  it('deletes a part, mirrors, swaps colours', () => {
    const m = new VoxelModel();
    build(m, 'house_small');
    const before = m.size;
    executeCommand(m, sanitizeCommand({ type: 'delete', target: 'chimney' })!);
    expect(m.size).toBe(before - 3);
    expect(executeCommand(m, sanitizeCommand({ type: 'mirror', target: 'last' })!).ok).toBe(true);
    expect(m.size).toBe(before - 3);
    executeCommand(m, sanitizeCommand({ type: 'replace', fromColor: 'roof_red', color: 'gold' })!);
    expect([...m.cells.values()].some((c) => c.c === 'roof_red')).toBe(false);
  });
  it('writes text that wraps to the grid and spawns as a sign', () => {
    expect(layoutText('HELLO WORLD', 16)).toEqual(['HELL', 'O', 'WORL', 'D']);
    expect(layoutText('HI TEAM', 16)).toEqual(['HI', 'TEAM']);
    const bp = textBlueprint('HI');
    expect(bp.voxels.length).toBeGreaterThan(15);
    const m = new VoxelModel();
    expect(executeCommand(m, sanitizeCommand({ type: 'text', text: 'Q4 GO!' })!).ok).toBe(true);
  });
  it('charts values with bars proportional to the numbers', () => {
    const { heights } = chartBlueprint([2, 4, 8]);
    expect(heights[2]).toBeGreaterThan(heights[1]);
    expect(heights[1]).toBeGreaterThan(heights[0]);
    expect(Math.round(heights[2] / heights[1])).toBe(2);
    const m = new VoxelModel();
    expect(executeCommand(m, sanitizeCommand({ type: 'chart', values: [3, 7, 5, 9] })!).ok).toBe(true);
    expect(measure([...m.cells.keys()])).toMatch(/blocks/);
  });
  it('lays out floor plans with the right number of rooms', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const bp = floorplanBlueprint(n);
      const rooms = new Set(bp.voxels.map((v) => v.cl).filter((c) => c?.startsWith('plan/room')));
      expect(rooms.size).toBe(n);
      const m = new VoxelModel();
      const plan = planSpawn(m, bp, {});
      expect(plan.clipped).toBe(false);
    }
  });
});
