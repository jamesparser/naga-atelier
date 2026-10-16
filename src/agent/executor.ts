/**
 * Applies validated BuildCommands to the voxel model. Pure w.r.t. rendering:
 * the scene listens to model events and to the returned result for effects.
 */
import type { BuildCommand } from '../../shared/protocol.js';
import { CELL } from '../config.js';
import type { VoxelModel } from '../blocks/voxelModel.js';
import { getBlueprint, planSpawn, type SpawnPlan } from '../blueprints/index.js';

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
      model.commit(`build ${bp.id}`, plan.changes, plan.spawnId);
      return { ok: true, spawn: plan, keys: plan.order };
    }
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
