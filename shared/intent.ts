/**
 * Deterministic English intent parser: utterance -> AgentEnvelope.
 *
 * Used (1) by the server as a fast path / fallback when the LLM is slow,
 * unavailable or returns junk, and (2) by the client when the agent endpoint
 * is unreachable, so typed/recognised commands still work offline.
 */
import type { AgentEnvelope, Anchor, BlueprintId, BuildCommand, PaletteName } from './protocol.js';

const BLUEPRINT_WORDS: Array<[RegExp, BlueprintId, string]> = [
  [/\b(house|cottage|home|hut|cabin)\b/, 'house_small', 'a small cottage'],
  [/\b(stairs?|staircase|steps)\b/, 'stairs', 'some stairs'],
  [/\b(tower|turret|castle|lighthouse)\b/, 'tower', 'a tower'],
  [/\b(garden|plants?|flowers?|park|tree)\b/, 'garden', 'a little garden'],
  [/\b(shelf|shelves|bookcase|bookshelf)\b/, 'desk_shelf', 'a desk shelf'],
  [/\b(arch|archway|gate|portal)\b/, 'arch', 'an arch'],
  [/\b(bench|seat|chair)\b/, 'bench', 'a bench'],
  [/\b(fireplace|fire ?place|hearth|campfire|fire)\b/, 'fireplace', 'a fireplace'],
  [/\b(maze|labyrinth)\b/, 'maze_tiny', 'a tiny maze'],
  [/\b(wall|fence|barrier)\b/, 'wall', 'a wall'],
];

const COLOR_WORDS: Array<[RegExp, PaletteName, string]> = [
  [/\b(red|crimson|scarlet)\b/, 'roof_red', 'red'],
  [/\b(brown|wood|wooden|oak)\b/, 'oak', 'oak'],
  [/\b(gr[ae]y|stone|rock|silver)\b/, 'stone', 'stone'],
  [/\b(white|snow|marble)\b/, 'white', 'white'],
  [/\b(green|grass|leafy)\b/, 'grass', 'green'],
  [/\b(blue|sky|navy)\b/, 'sky', 'blue'],
  [/\b(water|teal|cyan|aqua|turquoise)\b/, 'water', 'teal'],
  [/\b(gold|golden|yellow|orange|amber)\b/, 'gold', 'gold'],
  [/\b(black|dark|ink|charcoal)\b/, 'ink', 'ink'],
  [/\b(glass|clear|transparent|crystal)\b/, 'glass', 'glass'],
];

/** Cluster names authored in blueprints that users may refer to. */
export const CLUSTER_WORDS: Array<[RegExp, string]> = [
  [/\broofs?\b/, 'roof'],
  [/\bwalls\b/, 'walls'],
  [/\bchimney\b/, 'chimney'],
  [/\bdoors?\b/, 'door'],
  [/\bwindows?\b/, 'windows'],
  [/\b(top|battlements?|crenell?ations?)\b/, 'top'],
  [/\bflag\b/, 'flag'],
  [/\b(lawn|grass)\b/, 'lawn'],
  [/\b(pond|pool|water)\b/, 'pond'],
  [/\btree\b/, 'tree'],
  [/\bflowers?\b/, 'flowers'],
  [/\bsteps\b/, 'steps'],
  [/\bbooks?\b/, 'books'],
  [/\bframe\b/, 'frame'],
  [/\b(pillars?|columns?)\b/, 'pillars'],
  [/\bkeystone\b/, 'keystone'],
  [/\bseat\b/, 'seat'],
  [/\blegs?\b/, 'legs'],
  [/\b(backrest|back rest)\b/, 'backrest'],
  [/\b(flames?|fire)\b/, 'fire'],
  [/\bhearth\b/, 'hearth'],
  [/\b(hedges?|maze walls?)\b/, 'hedges'],
];

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

export function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function findColor(t: string): [PaletteName, string] | null {
  for (const [re, name, spoken] of COLOR_WORDS) if (re.test(t)) return [name, spoken];
  return null;
}

function findBlueprint(t: string): [BlueprintId, string] | null {
  for (const [re, id, spoken] of BLUEPRINT_WORDS) if (re.test(t)) return [id, spoken];
  return null;
}

function findCluster(t: string): string | null {
  for (const [re, name] of CLUSTER_WORDS) if (re.test(t)) return name;
  return null;
}

function envelope(speech: string, build: BuildCommand | null): AgentEnvelope {
  if (build) build.message = speech;
  return { speech, build, source: 'rules' };
}

/**
 * Parse one utterance. Returns null when nothing actionable or conversational
 * was recognised (caller may then ask an LLM or reply generically).
 */
export function parseIntent(raw: string): AgentEnvelope | null {
  const t = normalise(raw);
  if (t.trim().length === 0) return null;

  // --- history ---------------------------------------------------------
  if (/\b(redo|do that again|put it back)\b/.test(t)) {
    return envelope('Redone.', { v: 1, type: 'redo' });
  }
  if (/\b(undo|go back|oops|take (that|it) back|revert|never ?mind)\b/.test(t)) {
    return envelope(pick(['Undid that.', 'Rolled it back.', 'Undone.'], t), { v: 1, type: 'undo' });
  }
  // --- clear -----------------------------------------------------------
  if (
    /\b(clear|wipe|reset|start over|clean (up|the desk)|empty the desk)\b/.test(t) ||
    /\b(delete|remove|destroy) (everything|all|it all)\b/.test(t)
  ) {
    return envelope(pick(['Clearing the desk.', 'Fresh desk.'], t), { v: 1, type: 'clear' });
  }

  const blueprint = findBlueprint(t);
  const color = findColor(t);
  const cluster = findCluster(t);
  const recolorVerb = /\b(paint|colou?r|recolou?r|turn|change|make|dye)\b/.test(t);
  const buildVerb = /\b(build|make|create|place|put|add|spawn|give me|draw|construct|show me|i want|lets have|can you)\b/.test(t);
  const strongBuildVerb = /\b(build|create|place|put|add|spawn|give me|draw|construct)\b/.test(t);

  // --- scale -----------------------------------------------------------
  if (!blueprint || /\b(it|that|this)\b/.test(t)) {
    if (/\b(bigger|larger|grow|scale up|enlarge|taller)\b/.test(t)) {
      return envelope(pick(['Scaling it up.', 'A bit bigger.'], t), { v: 1, type: 'scale', scale: 1.25, target: 'last' });
    }
    if (/\b(smaller|shrink|scale down|tinier|shorter)\b/.test(t)) {
      return envelope(pick(['Scaling it down.', 'A bit smaller.'], t), { v: 1, type: 'scale', scale: 0.8, target: 'last' });
    }
    // --- rotate ----------------------------------------------------------
    if (/\b(rotate|spin|turn (it|that|this) ?(around|round)?|face the other way)\b/.test(t)) {
      const turns = /\b(around|round|other way|180)\b/.test(t) ? 2 : /\b(left|counter|anti)\b/.test(t) ? 3 : 1;
      return envelope('Rotating it.', { v: 1, type: 'rotate', turns, target: 'last' });
    }
    // --- move ------------------------------------------------------------
    const moveVerb = /\b(move|nudge|shift|slide|push|bring|pull)\b/.test(t);
    if (moveVerb) {
      const step = /\b(a lot|far|much)\b/.test(t) ? 0.16 : 0.08;
      let dx = 0, dy = 0, dz = 0;
      if (/\bleft\b/.test(t)) dx -= step;
      if (/\bright\b/.test(t)) dx += step;
      if (/\b(closer|toward me|towards me|forward|nearer)\b/.test(t)) dz += step;
      if (/\b(away|back|further|farther)\b/.test(t)) dz -= step;
      if (/\bup\b/.test(t)) dy += step / 2;
      if (/\bdown\b/.test(t)) dy -= step / 2;
      if (dx || dy || dz) {
        return envelope(pick(['Nudged it.', 'Moved it.'], t), {
          v: 1, type: 'move', target: cluster ?? 'last', dx, dy, dz,
        });
      }
    }
  }

  // --- recolor -----------------------------------------------------------
  if (color && (!blueprint || (cluster && !strongBuildVerb)) && (recolorVerb || cluster || /\b(it|that|this|everything|all)\b/.test(t))) {
    const target = /\b(everything|all|whole desk)\b/.test(t) ? 'all' : cluster ?? 'last';
    const what = target === 'all' ? 'Everything' : target === 'last' ? 'It' : target[0].toUpperCase() + target.slice(1);
    const plural = target !== 'last' && target !== 'all' && target.endsWith('s');
    return envelope(`${what} ${plural ? 'are' : 'is'} ${color[1]} now.`, { v: 1, type: 'color', color: color[0], target });
  }

  // --- build -----------------------------------------------------------
  if (blueprint && (buildVerb || t.trim().split(' ').length <= 4)) {
    let anchor: Anchor = 'desk_center';
    if (/\bleft\b/.test(t)) anchor = 'desk_left';
    else if (/\bright\b/.test(t)) anchor = 'desk_right';
    else if (/\b(float|floating|in the air|above|hovering|sky)\b/.test(t)) anchor = 'floating';
    let scale = 1;
    if (/\b(tiny|mini|little)\b/.test(t)) scale = 0.7;
    else if (/\b(big|large|tall|grand)\b/.test(t)) scale = 1.4;
    else if (/\b(huge|giant|massive|enormous)\b/.test(t)) scale = 1.8;
    const cmd: BuildCommand = { v: 1, type: 'build', blueprintId: blueprint[0], anchor, scale };
    if (color) cmd.color = color[0];
    const speech = pick([`On it — ${blueprint[1]}.`, `Placing ${blueprint[1]}.`, `Here comes ${blueprint[1]}.`], t);
    return envelope(speech, cmd);
  }

  // --- small talk ----------------------------------------------------------
  if (/\b(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t)) {
    return envelope('Hi! Ask me to build a house, a tower, or a garden.', null);
  }
  if (/\b(what can you (do|build|make)|help|options|ideas)\b/.test(t)) {
    return envelope('I can build houses, towers, stairs, arches, gardens, a maze and more.', null);
  }
  if (/\b(thanks|thank you|nice|cool|awesome|great|love it)\b/.test(t)) {
    return envelope(pick(['Anytime.', 'Happy to help.', 'Glad you like it.'], t), null);
  }
  return null;
}

/** Generic reply when nothing matched and no LLM is available. */
export function fallbackEnvelope(raw: string): AgentEnvelope {
  return {
    speech: "I don't know that shape yet. Try a house, tower, arch or garden.",
    build: null,
    transcript: raw,
    source: 'fallback',
  };
}
