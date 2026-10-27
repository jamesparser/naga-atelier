/**
 * Applies validated BuildCommands to the voxel model. Pure w.r.t. rendering:
 * the scene listens to model events and to the returned result for effects.
 */
import type { BuildCommand } from '../../shared/protocol.js';
import { CELL } from '../config.js';
import type { VoxelModel } from '../blocks/voxelModel.js';
import { blueprintFromShape, getBlueprint, planSpawn, type SpawnPlan } from '../blueprints/index.js';
import { chartBlueprint, deleteChanges, duplicateChanges, floorplanBlueprint, mirrorChanges, replaceColorChanges, textBlueprint } from './tools.js';

export interface ExecResult {
  ok: boolean;
  /** Replacement line when the command could not be done as asked. */
  speech?: string;
  spawn?: SpawnPlan;
  /** keys touched (for highlight / naga aim) */
  keys?: string[];
}

export function executeCommand(model: VoxelModel, cmd: BuildCommand): ExecResult {
  switch (cmd.type) {
    case 'build': {
      const bp = cmd.blueprintId ? getBlueprint(cmd.blueprintId) : null;
      if (!bp) return { ok: false, speech: "I don't know that shape yet." };
      const plan = planSpawn(model, bp, { anchor: cmd.anchor, color: cmd.color, scale: cmd.scale });
      if (plan.changes.length === 0) return { ok: false, speech: 'The desk is too full — clear some space?' };
      model.labels.set(plan.spawnId, bp.id);
      model.commit(`build ${bp.id}`, plan.changes, plan.spawnId);
      return { ok: true, spawn: plan, keys: plan.order };
    }
    case 'sculpt': {
      if (!cmd.shape) return { ok: false, speech: "I couldn't picture that one." };
      const bp = blueprintFromShape(cmd.shape);
      const plan = planSpawn(model, bp, { anchor: cmd.anchor, color: cmd.color, scale: cmd.scale });
      if (plan.changes.length === 0) return { ok: false, speech: 'The desk is too full — clear some space?' };
      model.labels.set(plan.spawnId, bp.label.toLowerCase().replace(/[^a-z]+/g, '_'));
      model.commit(`sculpt ${bp.label}`, plan.changes, plan.spawnId);
      return { ok: true, spawn: plan, keys: plan.order };
    }
    case 'export':
      // Client-side side effect (download). Nothing to mutate in the model.
      return { ok: true };
    case 'grid':
      // Client rebuilds desk/renderer for the new block size. Model is cleared there.
      return { ok: true };
    case 'clear': {
      if (model.size === 0) return { ok: true, speech: 'The desk is already clear.' };
      model.commit('clear', model.diff([...model.cells.keys()].map((k) => [k, null])), null);
      return { ok: true };
    }
    case 'undo':
      return model.undo() ? { ok: true } : { ok: false, speech: 'Nothing to undo.' };
    case 'redo':
      return model.redo() ? { ok: true } : { ok: false, speech: 'Nothing to redo.' };
    case 'color': {
      const keys = model.resolveTarget(cmd.target);
      if (!keys.length || !cmd.color) return { ok: false, speech: 'There is nothing to paint yet.' };
      model.commit(`color ${cmd.target ?? 'last'}`, model.recolorChanges(keys, cmd.color));
      return { ok: true, keys };
    }
    case 'move': {
      const keys = model.resolveTarget(cmd.target);
      if (!keys.length) return { ok: false, speech: 'There is nothing to move yet.' };
      const d: [number, number, number] = [
        Math.round((cmd.dx ?? 0) / CELL),
        Math.round((cmd.dy ?? 0) / CELL),
        Math.round((cmd.dz ?? 0) / CELL),
      ];
      // Back off step by step if the full move is blocked.
      for (let f = 1; f > 0; f -= 0.25) {
        const step: [number, number, number] = [Math.round(d[0] * f), Math.round(d[1] * f), Math.round(d[2] * f)];
        if (!step[0] && !step[1] && !step[2]) break;
        const ch = model.moveChanges(keys, step);
        if (ch) {
          model.commit('move', ch);
          return { ok: true, keys };
        }
      }
      return { ok: false, speech: "It's blocked that way." };
    }
    case 'scale': {
      const keys = model.resolveTarget(cmd.target);
      if (!keys.length) return { ok: false, speech: 'There is nothing to scale yet.' };
      const ch = model.scaleChanges(keys, cmd.scale ?? 1);
      if (!ch || ch.length === 0) return { ok: false, speech: "It can't get any " + ((cmd.scale ?? 1) > 1 ? 'bigger here.' : 'smaller.') };
      model.commit('scale', ch);
      return { ok: true };
    }
    case 'game':
      return { ok: false, speech: 'Game commands are handled by the game mode.' };
    case 'info':
    case 'board':
    case 'turn':
    case 'save':
    case 'load':
      return { ok: false, speech: 'That is answered by the app.' };
    case 'duplicate': {
      const keys = model.resolveTarget(cmd.target);
      if (!keys.length) return { ok: false, speech: 'There is nothing to copy yet.' };
      const n = cmd.count ?? 1;
      const d = duplicateChanges(model, keys, n);
      if (!d.placed) return { ok: false, speech: 'No room for a copy — clear some space?' };
      const srcLabel = model.labels.get(model.cells.get(keys[0])?.cl?.split(':')[0] ?? '');
      if (srcLabel) for (const sid of d.spawnIds) model.labels.set(sid, srcLabel);
      model.commit(`duplicate ×${d.placed}`, d.changes, d.spawnIds[d.spawnIds.length - 1]);
      const ks = d.changes.map((c) => c.key);
      return { ok: true, keys: ks, spawn: { spawnId: d.spawnIds[0], changes: d.changes, order: ks, clipped: d.placed < n }, speech: d.placed < n ? `Only room for ${d.placed}.` : undefined };
    }
    case 'delete': {
      const keys = model.resolveTarget(cmd.target);
      if (!keys.length) return { ok: false, speech: 'There is nothing to remove.' };
      model.commit(`delete ${cmd.target ?? 'last'}`, deleteChanges(model, keys));
      return { ok: true };
    }
    case 'mirror': {
      const keys = model.resolveTarget(cmd.target);
      if (!keys.length) return { ok: false, speech: 'There is nothing to mirror yet.' };
      model.commit('mirror', mirrorChanges(model, keys));
      return { ok: true, keys };
    }
    case 'replace': {
      const keys = model.resolveTarget(cmd.target ?? 'all');
      const ch = cmd.fromColor && cmd.color ? replaceColorChanges(model, keys, cmd.fromColor, cmd.color) : [];
      if (!ch.length) return { ok: false, speech: `I don't see any ${cmd.fromColor?.replace('roof_red', 'red') ?? 'of that colour'} blocks.` };
      model.commit('swap colour', ch);
      return { ok: true, keys: ch.map((c) => c.key) };
    }
    case 'text':
    case 'chart':
    case 'floorplan': {
      const bp =
        cmd.type === 'text' ? textBlueprint(cmd.text ?? 'HI', cmd.color ?? 'gold')
        : cmd.type === 'chart' ? chartBlueprint(cmd.values ?? [1], cmd.color).bp
        : floorplanBlueprint(cmd.rooms ?? 4);
      const plan = planSpawn(model, bp, { anchor: cmd.anchor });
      if (plan.changes.length === 0) return { ok: false, speech: 'The desk is too full — clear some space?' };
      model.labels.set(plan.spawnId, cmd.type === 'text' ? 'sign' : cmd.type === 'chart' ? 'chart' : 'floor_plan');
      model.commit(`${cmd.type}`, plan.changes, plan.spawnId);
      return { ok: true, spawn: plan, keys: plan.order, speech: plan.clipped ? 'It only partly fits — try a bigger grid?' : undefined };
    }
    case 'rotate': {
      const keys = model.resolveTarget(cmd.target);
      if (!keys.length) return { ok: false, speech: 'There is nothing to rotate yet.' };
      const ch = model.rotateChanges(keys, cmd.turns ?? 1);
      if (!ch) return { ok: false, speech: "There isn't room to turn it." };
      model.commit('rotate', ch);
      return { ok: true };
    }
  }
}
