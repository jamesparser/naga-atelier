/**
 * Deterministic English intent parser: utterance -> AgentEnvelope.
 *
 * Used (1) by the server as a fast path / fallback when the LLM is slow,
 * unavailable or returns junk, and (2) by the client when the agent endpoint
 * is unreachable, so typed/recognised commands still work offline.
 */
import type { AgentEnvelope, Anchor, BlueprintId, BuildCommand, GameMode, PaletteName } from './protocol.js';

const BLUEPRINT_WORDS: Array<[RegExp, BlueprintId, string]> = [
  // specific things first, so "lighthouse" is not a house and "castle" is not a tower
  [/\b(light ?house|beacon)\b/, 'lighthouse', 'a lighthouse'],
  [/\b(wind ?mill|mill)\b/, 'windmill', 'a windmill'],
  [/\b(bridges?|footbridge|overpass|viaduct)\b/, 'bridge', 'a bridge'],
  [/\b(rockets?|space ?ships?|spacecraft|missile|shuttle)\b/, 'rocket', 'a rocket'],
  [/\b(cars?|automobile|vehicle|truck|jeep|taxi|racecar|race car|van)\b/, 'car', 'a car'],
  [/\b(boats?|ships?|sail ?boat|yacht|canoe|ferry)\b/, 'boat', 'a sailboat'],
  [/\b(trains?|locomotive|railway|steam engine)\b/, 'train', 'a train'],
  [/\b(planes?|aeroplane|airplane|jet|aircraft)\b/, 'plane', 'an aeroplane'],
  [/\b(castles?|fortress|fort|palace|kingdom)\b/, 'castle', 'a castle'],
  [/\b(pyramids?|ziggurat)\b/, 'pyramid', 'a pyramid'],
  [/\b(robots?|droid|mech|android)\b/, 'robot', 'a robot'],
  [/\b(dogs?|puppy|doggy|pup|pet)\b/, 'dog', 'a dog'],
  [/\b(snow ?man|snowmen|frosty)\b/, 'snowman', 'a snowman'],
  [/\b(tents?|camping|campsite|camp)\b/, 'tent', 'a tent'],
  [/\b(hearts?|love)\b/, 'heart', 'a heart'],
  [/\b(beds?|bunk)\b/, 'bed', 'a bed'],
  [/\b(tables?|dining table)\b/, 'table', 'a table'],
  [/\b(chairs?|stool|throne)\b/, 'chair', 'a chair'],
  [/\b(house|cottage|home|hut|cabin)\b/, 'house_small', 'a small cottage'],
  [/\b(stairs?|staircase|steps)\b/, 'stairs', 'some stairs'],
  [/\b(tower|turret|skyscraper)\b/, 'tower', 'a tower'],
  [/\b(trees?|oak tree|apple tree)\b/, 'tree', 'a tree'],
  [/\b(garden|plants?|flowers?|park|lawn)\b/, 'garden', 'a little garden'],
  [/\b(shelf|shelves|bookcase|bookshelf)\b/, 'desk_shelf', 'a desk shelf'],
  [/\b(arch|archway|gate|portal)\b/, 'arch', 'an arch'],
  [/\b(bench|seat|sofa|couch)\b/, 'bench', 'a bench'],
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
  [/\b(black|dark|ink|charcoal)\b/, 'ink', 'black'],
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
  [/\b(wheels?|tyres?|tires?)\b/, 'wheels'],
  [/\bsails?\b/, 'sail'],
  [/\bmast\b/, 'mast'],
  [/\bhull\b/, 'hull'],
  [/\bdeck\b/, 'deck'],
  [/\b(railings?|rails?|handrails?)\b/, 'railings'],
  [/\bpiers?\b/, 'piers'],
  [/\b(river|stream)\b/, 'river'],
  [/\bwings?\b/, 'wings'],
  [/\btail\b/, 'tail'],
  [/\bnose\b/, 'nose'],
  [/\bfins?\b/, 'fins'],
  [/\bcockpit\b/, 'cockpit'],
  [/\b(eyes?)\b/, 'eyes'],
  [/\bears?\b/, 'ears'],
  [/\bheads?\b/, 'head'],
  [/\barms?\b/, 'arms'],
  [/\bantenna\b/, 'antenna'],
  [/\bcollar\b/, 'collar'],
  [/\b(leaves|canopy|foliage)\b/, 'leaves'],
  [/\btrunk\b/, 'trunk'],
  [/\bapples?\b/, 'apples'],
  [/\bhat\b/, 'hat'],
  [/\bbuttons?\b/, 'buttons'],
  [/\b(blanket|duvet|covers?)\b/, 'blanket'],
  [/\bpillows?\b/, 'pillow'],
  [/\bmattress\b/, 'mattress'],
  [/\bturrets?\b/, 'turrets'],
  [/\bkeep\b/, 'keep'],
  [/\b(head ?lights?|lights?|lamp)\b/, 'lights'],
  [/\b(wagons?|carriages?|cars of the train)\b/, 'wagons'],
  [/\bcargo\b/, 'cargo'],
  [/\bengine\b/, 'engine'],
  [/\bcab\b/, 'cab'],
  [/\bblades\b/, 'sails'],
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

  // --- tetris mode -------------------------------------------------------
  if (/\b(stop|exit|quit|end|leave|close) (the )?(game|tetris)\b/.test(t) || /\b(build(ing)? mode|back to build(ing)?)\b/.test(t)) {
    return envelope('Back to building.', { v: 1, type: 'game', action: 'stop' });
  }
  // arcade games (checked before Tetris so "play star swarm" is not read as "play a game")
  const arcade: Array<[RegExp, string, string]> = [
    [/\b(star ?swarm|galago|galaga|space ?shooter|shoot(ing)? (the )?aliens?|space invaders?|alien game)\b/, 'swarm', 'Star Swarm! Blast the swarm.'],
    [/\b(marble( maze)?|tilt( maze| game)?|labyrinth game|ball maze)\b/, 'maze', 'Marble Maze — tilt to roll.'],
    [/\b(whack|bop|mole)/, 'whack', 'Whack-a-Gloom! Bop them.'],
    [/\b(breakout|brick ?breaker|bricks game|arkanoid|paddle game)\b/, 'breakout', 'Breakout 3D!'],
    [/\b(block tower|jenga|tower game|stacking game|pull (a |the )?blocks?)\b/, 'tower', 'Block Tower — pull slowly.'],
    [/\b(flap ?bro|fappy|flappy|flappy bro|flapping game|bird game)\b/, 'flapbro', 'Flap Bro! Flap through the gaps.'],
    [/\b(mike penguin|penguin( game| run| adventure)?|ice run)\b/, 'penguin', 'Mike Penguin! Run for the flag.'],
    [/\b(arcade|more games|other games|mini ?games?|game menu|pick a game)\b/, 'arcade', 'Arcade! Pick a game.'],
  ];
  const wantsBuild = /\b(build|make|create|place|put|add|spawn|draw|construct|sculpt)\b/.test(t);
  if (!wantsBuild && (/\b(play|start|open|launch|lets|game|go to|switch to)\b/.test(t) || t.trim().split(' ').length <= 3)) {
    for (const [re, game, line] of arcade) if (re.test(t)) return envelope(line, { v: 1, type: 'game', action: 'start', game: game as GameMode });
  }
  if (/\b(angry birds?|angry sling|sling ?shot|sling mode|play sling|catapult|birds? game|launch(ing)? game|knock (them|it) down)\b/.test(t)) {
    return envelope('Angry Sling — pull back and let fly!', { v: 1, type: 'game', action: 'start', game: 'sling' });
  }
  if (/\b(next level|skip level)\b/.test(t)) {
    return envelope('Next level.', { v: 1, type: 'game', action: 'next' });
  }
  if (/\b(retry|try again|restart( the)? level|reset( the)? level)\b/.test(t)) {
    return envelope('Again!', { v: 1, type: 'game', action: 'retry' });
  }
  if (/\b(tetris|play (a |the )?game|game mode|lets play|start (a |the )?game|new game)\b/.test(t)) {
    return envelope(pick(['Tetris time!', "Let's play Tetris!"], t), { v: 1, type: 'game', action: 'start', game: 'tetris' });
  }
  if (/\b(pause|resume|unpause)\b/.test(t)) {
    return envelope('Okay.', { v: 1, type: 'game', action: 'pause' });
  }
  if (/^ (drop( it)?|slam( it)?|hard drop) $/.test(t)) {
    return envelope('Drop!', { v: 1, type: 'game', action: 'drop' });
  }
  // --- board colour: "make the board blue", "board colour black", "clear board" -------------
  if (/\b(board|base ?plate|build mat|mat)\b/.test(t) && !/\b(game|tetris|floor ?plan)\b/.test(t)) {
    if (/\b(clear|see.?through|transparent|invisible)\b/.test(t)) return envelope('See-through board.', { v: 1, type: 'board', color: 'glass' });
    const c = findColor(t);
    if (c) return envelope(`The board is ${c[1]} now.`, { v: 1, type: 'board', color: c[0] });
    if (/\b(colou?r|change|next|switch)\b/.test(t)) return envelope('New board colour.', { v: 1, type: 'board' });
  }
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
  // --- export ----------------------------------------------------------
  if (
    /\b(export|download|save (my |the |this |a )?(desk|world|build|scene|file|html)|save it|keep (a copy|this))\b/.test(t)
  ) {
    return envelope(pick(['Saving your desk as HTML.', 'Exporting your world.', 'Here is your HTML file.'], t), {
      v: 1,
      type: 'export',
    });
  }
  // --- grid / block size -----------------------------------------------
  if (/\b(more room|more space|need (more )?(room|space)|bigger grid|larger grid|bigger desk|room for more|out of room)\b/.test(t)) {
    return envelope('More room coming up — your build comes along.', { v: 1, type: 'grid', preset: 'finer' });
  }
  if (/\b(smaller grid|less room|fewer blocks)\b/.test(t)) {
    return envelope('Bigger blocks, smaller grid.', { v: 1, type: 'grid', preset: 'coarser' });
  }
  if (/\b(12\s*(?:[x×]|by)\s*12|draft grid|draft mode|big blocks|bigger blocks|coarse|easy blocks)\b/.test(t)) {
    return envelope('Switching to draft — big 12 by 12 blocks.', { v: 1, type: 'grid', preset: 'draft' });
  }
  if (/\b(16\s*(?:[x×]|by)\s*12|studio|default (grid|blocks)|normal blocks)\b/.test(t)) {
    return envelope('Studio grid — balanced blocks.', { v: 1, type: 'grid', preset: 'studio' });
  }
  if (/\b(24\s*(?:[x×]|by)\s*24|detail grid|detail mode|more detail|smaller blocks|fine blocks|finer)\b/.test(t)) {
    return envelope('Detail grid — smaller 24 by 24 blocks.', { v: 1, type: 'grid', preset: 'detail' });
  }
  if (/\b(48\s*(?:[x×]|by)\s*48|fine grid|fine mode|tiny blocks)\b/.test(t)) {
    return envelope('Fine grid — 48 by 48 tiny blocks.', { v: 1, type: 'grid', preset: 'fine' });
  }
  if (/\b(64\s*(?:[x×]|by)\s*64|mosaic|maximum detail|smallest blocks)\b/.test(t)) {
    return envelope('Mosaic grid — 64 by 64, the finest hands can use.', { v: 1, type: 'grid', preset: 'mosaic' });
  }
  if (/\b(next grid|change (grid|block size)|cycle (grid|blocks)|block size)\b/.test(t)) {
    return envelope('Cycling block size.', { v: 1, type: 'grid' });
  }

  // --- productivity tools ---------------------------------------------------------
  const tool = parseTool(t, raw);
  if (tool) return tool;

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
    return envelope('I can build houses, castles, bridges, cars, boats, trains, planes, rockets, robots, a dog, and if you describe something new I will sculpt it.', null);
  }
  if (/\b(thanks|thank you|nice|cool|awesome|great|love it)\b/.test(t)) {
    return envelope(pick(['Anytime.', 'Happy to help.', 'Glad you like it.'], t), null);
  }
  return null;
}

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, another: 1, couple: 2, few: 3 };
const PALETTE_WORD = (w: string): PaletteName | null => {
  for (const [re, name] of COLOR_WORDS) if (re.test(` ${w} `)) return name;
  return null;
};

/** Duplicate / delete / mirror / colour swap / text / chart / floor plan / info / save / load. */
function parseTool(t: string, raw: string): AgentEnvelope | null {
  const cluster = findCluster(t);
  const bp = findBlueprint(t);
  // a named object or part: "the chair", "the roof"
  // "the car" names an object; "on the left" / "the desk" do not
  const det = /\b(the|that|this|my|those|these) (?!left\b|right\b|desk\b|middle\b|front\b|back\b)/.test(t);
  const target = cluster ?? (bp && det ? bp[0] : null);
  // info --------------------------------------------------------------------------
  if (/\b(list|show|what are) (my )?(saves|saved|layouts)\b/.test(t)) return envelope('Your saved layouts:', { v: 1, type: 'info', question: 'saves' });
  if (/\bhow many (blocks|cubes|pieces|voxels)\b/.test(t)) return envelope('Counting.', { v: 1, type: 'info', question: 'count', target: target ?? 'all' });
  if (/\b(how (big|tall|wide|long|high|large) is|measure|dimensions|what size)\b/.test(t)) return envelope('Measuring.', { v: 1, type: 'info', question: 'size', target: target ?? 'last' });
  if (/\b(what('| i)?s on (my|the) desk|describe (my |the )?(desk|scene|build)|what did (i|we) build|what have (i|we) (got|built))\b/.test(t)) return envelope('Here is your desk.', { v: 1, type: 'info', question: 'describe' });
  // save / load ---------------------------------------------------------------------
  const nameM = raw.toLowerCase().match(/\b(?:as|called|named)\s+["“']?([a-z0-9 _-]{1,20}?)["”']?\s*[.!?]?$/);
  if (/\b(save|store|keep) (this|it|my desk|the desk|the layout|this layout)\b/.test(t) && !/\b(html|file|export)\b/.test(t)) {
    const name = nameM?.[1]?.trim() || 'my desk';
    return envelope(`Saving as ${name}.`, { v: 1, type: 'save', name });
  }
  const loadM = raw.toLowerCase().match(/\b(?:load|open|restore|bring back)\s+(?:my |the |layout |plan )*["“']?([a-z0-9 _-]{1,20}?)["”']?\s*[.!?]?$/);
  if (loadM && !/\b(game|arcade|tetris)\b/.test(t)) return envelope(`Loading ${loadM[1].trim()}.`, { v: 1, type: 'load', name: loadM[1].trim() });
  // text ----------------------------------------------------------------------------------
  const textM = raw.match(/\b(?:write|spell|sign (?:that )?(?:says|reads)|text|letters? for|label (?:it )?)\s*[:]?\s*["“']?([A-Za-z0-9 !?.\-]{1,24}?)["”']?\s*(?:in (?:blocks|gold|red|blue|green|white|black))?\s*[.!]?$/i);
  if (textM && textM[1].trim() && /\b(write|spell|sign|text|letters|label)\b/.test(t)) {
    const color = findColor(t.replace(textM[1].toLowerCase(), ''));
    const cmd: BuildCommand = { v: 1, type: 'text', text: textM[1].trim().toUpperCase(), anchor: 'desk_center' };
    if (color) cmd.color = color[0];
    return envelope(`Writing ${textM[1].trim()}.`, cmd);
  }
  // chart -----------------------------------------------------------------------------------
  if (/\b(chart|graph|bars?|plot)\b/.test(t)) {
    const nums = (raw.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n >= 0).slice(0, 10);
    if (nums.length) return envelope(`Charting ${nums.length} value${nums.length === 1 ? '' : 's'}.`, { v: 1, type: 'chart', values: nums, anchor: 'desk_center' });
  }
  // floor plan --------------------------------------------------------------------------------
  if (/\b(floor ?plan|room layout|office layout|layout with \w+ rooms|(\d|two|three|four|five|six) rooms)\b/.test(t)) {
    const n = Number(t.match(/(\d) rooms?/)?.[1] ?? NUM_WORDS[t.match(/\b(two|three|four|five|six) rooms?\b/)?.[1] ?? ''] ?? 4);
    return envelope(`Sketching ${n} rooms.`, { v: 1, type: 'floorplan', rooms: n, anchor: 'desk_center' });
  }
  // duplicate --------------------------------------------------------------------------------
  const dup = /\b(duplicate|copy|clone|another one|one more|(\w+) more\b)/.test(t) && !/\bundo\b/.test(t);
  if (dup && /\b(duplicate|copy|clone|make|add|build|give|place|put|another|one more|more)\b/.test(t)) {
    const m = t.match(/\b(\d|one|two|three|four|five|six|a couple|a few) (more|copies|times|of (it|them|those))\b/) ?? t.match(/\b(\d|two|three|four|five|six) (\w+s)\b/);
    let count = m ? Number(m[1]) || NUM_WORDS[m[1].replace('a ', '')] || 1 : 1;
    if (/\bin a row\b/.test(t) && count === 1) count = 3;
    // the thing being copied is the noun right after the count ("two more chairs by the table")
    let nounBp: [BlueprintId, string] | null = null;
    for (const m of t.matchAll(/\b(?:more|copies of|copy of|copy|duplicate|clone|another|\d|two|three|four|five|six) (?:more )?(?:the |my |of the |of )?([a-z]+)/g)) {
      nounBp = findBlueprint(m[1]);
      if (nounBp) break;
    }
    const tgt = (nounBp ? nounBp[0] : null) ?? target ?? (bp ? bp[0] : 'last');
    return envelope(count > 1 ? `Making ${count} copies.` : 'Copied.', { v: 1, type: 'duplicate', target: tgt, count });
  }
  // delete a part -----------------------------------------------------------------------------
  if (/\b(delete|remove|get rid of|take away|take off|erase|destroy)\b/.test(t) && !/\b(everything|all|it all|the desk)\b/.test(t)) {
    return envelope(target ? `Removed the ${target}.` : 'Removed it.', { v: 1, type: 'delete', target: target ?? 'last' });
  }
  // mirror ----------------------------------------------------------------------------------------
  if (/\b(mirror|flip)\b/.test(t)) return envelope('Mirrored.', { v: 1, type: 'mirror', target: target ?? 'last' });
  // recolour a whole object by name: "make the house red" (vs "build a red house")
  const col = findColor(t);
  if (col && bp && !cluster && det && /\b(paint|colou?r|turn|change|make|dye)\b/.test(t) && !/\b(build|create|place|put|add|spawn|draw|construct)\b/.test(t)) {
    return envelope(`The ${bp[1].split(' ').pop()} is ${col[1]} now.`, { v: 1, type: 'color', color: col[0], target: bp[0] });
  }
  // colour swap: "replace red with blue", "change all the red to blue", "swap red for blue" -------------
  const sw = t.match(/\b(?:replace|swap|change|turn) (?:all )?(?:the )?(\w+)(?: blocks?| ones)? (?:with|for|to|into) (\w+)\b/);
  if (sw) {
    const from = PALETTE_WORD(sw[1]), to = PALETTE_WORD(sw[2]);
    if (from && to && from !== to) return envelope(`Swapped ${sw[1]} for ${sw[2]}.`, { v: 1, type: 'replace', fromColor: from, color: to, target: 'all' });
  }
  return null;
}

/** Generic reply when nothing matched and no LLM is available. */
export function fallbackEnvelope(raw: string): AgentEnvelope {
  return {
    speech: "I couldn't work that one out. Try a house, car, castle, robot — or describe it simply.",
    build: null,
    transcript: raw,
    source: 'fallback',
  };
}
