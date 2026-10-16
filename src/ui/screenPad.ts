/**
 * On-screen controls for laptops and phones (hidden in the headset).
 * Every button shows what it does in words, plus its keyboard key, and has a tooltip.
 * A "How to play" sheet explains each input method: keyboard, mouse/touch, Quest hands, Quest controllers.
 */

export interface PadButton {
  id: string;
  label: string;
  /** keyboard hint shown on the button, e.g. "←" */
  key?: string;
  tip: string;
  /** repeat while held (movement, faster fall) */
  repeat?: boolean;
  wide?: boolean;
}

export interface PadLayout {
  title: string;
  hint: string;
  rows: PadButton[][];
  /** small buttons in the header (pause, help, exit) */
  extras: PadButton[];
  help: Array<{ head: string; lines: string[] }>;
}

export const TETRIS_PAD: PadLayout = {
  title: 'Tetris',
  hint: 'Fill a straight row left-to-right to blast it. Pick how many rows deep (1 = classic, 4 = hardest).',
  rows: [
    [
      { id: 'left', label: 'Left', key: '←', tip: 'Move left (← or A)', repeat: true },
      { id: 'away', label: 'Back row', key: '↑', tip: 'Move to the row behind (↑ or W)', repeat: true },
      { id: 'closer', label: 'Front row', key: '↓', tip: 'Move to the row in front (↓ or S)', repeat: true },
      { id: 'right', label: 'Right', key: '→', tip: 'Move right (→ or D)', repeat: true },
    ],
    [
      { id: 'spin', label: 'Spin', key: 'Q', tip: 'Spin the piece flat (Q or E)' },
      { id: 'flip', label: 'Flip', key: 'R', tip: 'Flip the piece toward you (R)' },
      { id: 'tilt', label: 'Tilt', key: 'F', tip: 'Tilt the piece sideways (F)' },
      { id: 'down', label: 'Faster', key: 'Shift', tip: 'Hold to fall faster (Shift or X)', repeat: true },
      { id: 'drop', label: 'Drop', key: 'Space', tip: 'Drop it all the way now (Space). Also starts a new game.', wide: true },
    ],
  ],
  extras: [
    { id: 'depth1', label: '1 row', key: '1', tip: 'Classic Tetris: 1 row deep (key 1). Restarts the game.' },
    { id: 'depth2', label: '2', key: '2', tip: '2 rows deep (key 2). Restarts the game.' },
    { id: 'depth3', label: '3', key: '3', tip: '3 rows deep (key 3). Restarts the game.' },
    { id: 'depth4', label: '4 rows', key: '4', tip: 'Full 3D: 4 rows deep (key 4). Restarts the game.' },
    { id: 'pause', label: 'Pause', key: 'P', tip: 'Pause / resume (P)' },
    { id: 'help', label: 'How to play', key: '?', tip: 'Show all controls' },
    { id: 'exit', label: 'Back to build', key: 'Esc', tip: 'Leave the game (Esc)' },
  ],
  help: [
    { head: 'Rows deep', lines: ['1 row = classic Tetris (easiest) · 2–4 rows = 3D', 'Keys 1–4, the row buttons, or ROWS on the desk', 'Changing rows starts a new game'] },
    { head: 'Keyboard', lines: ['← → move left / right', '↑ ↓ move to the back / front row (with 1 row: ↑ rotate, ↓ faster)', 'Q or E spin · R flip · F tilt', 'Shift hold = faster · Space = drop', 'P pause · Esc back to build'] },
    { head: 'Mouse or touch', lines: ['Drag on the game to slide the piece', 'Quick click / tap = spin', 'Use the buttons for flip, tilt, drop'] },
    { head: 'Quest — hands', lines: ['Pinch anywhere and move your hand to slide the piece', 'Pinch and twist your wrist to flip it', 'Quick pinch = spin · flick down = drop', 'Poke the labelled buttons on the desk', 'Poke ROWS 1-4 to pick how deep (1 = classic)'] },
    { head: 'Quest — controllers', lines: ['Thumbstick: left / right, push up = back row, down = front row', 'A or X = spin · B or Y = flip · press stick = tilt', 'Hold grip = faster · trigger = drop'] },
  ],
};

export const SLING_PAD: PadLayout = {
  title: 'Angry Sling',
  hint: 'Drag back from the slingshot and let go. Pop every purple gloomling to move on to the next of 12 levels.',
  rows: [
    [
      { id: 'retry', label: 'Retry level', key: 'R', tip: 'Restart this level (R)' },
      { id: 'next', label: 'Skip level', key: 'N', tip: 'Skip to the next level (N). Cleared levels advance on their own.' },
      { id: 'turnL', label: 'Turn left', key: 'Q', tip: 'Turn the arena left (Q)' },
      { id: 'turnR', label: 'Turn right', key: 'E', tip: 'Turn the arena right (E)' },
      { id: 'zoom', label: 'Zoom', key: 'Z', tip: 'Bigger / smaller arena (Z)' },
    ],
  ],
  extras: [
    { id: 'help', label: 'How to play', key: '?', tip: 'Show all controls' },
    { id: 'exit', label: 'Back to build', key: 'Esc', tip: 'Leave the game (Esc)' },
  ],
  help: [
    { head: 'Mouse or touch', lines: ['Press anywhere, drag toward you (down the screen), let go to fire', 'The dotted arc shows where it will fly', 'Mouse wheel while dragging = aim higher', 'Right-drag (two fingers on phone) = look around'] },
    { head: 'Keyboard', lines: ['R retry · N skip level · Q / E turn arena · Z zoom · Esc back'] },
    { head: 'Quest — hands', lines: ['Pinch (on the pebble or anywhere), pull back toward you, open your fingers to fire', 'Lean in or poke TURN / ZOOM to see from other angles'] },
    { head: 'Quest — controllers', lines: ['Hold the trigger, pull back, let go to fire', 'Point at the desk buttons and pull the trigger to press them'] },
  ],
};

export class ScreenPad {
  private el = document.createElement('div');
  private sheet = document.createElement('div');
  private timers = new Map<string, number>();
  private layout: PadLayout | null = null;

  constructor(private onAction: (id: string) => void) {
    this.el.id = 'pad';
    this.sheet.id = 'howto';
    document.body.append(this.el, this.sheet);
    this.sheet.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).dataset.close !== undefined || e.target === this.sheet) this.toggleHelp(false);
    });
  }

  /** Highlight the selected choice (e.g. rows deep) and hide buttons that don't apply. */
  setState(selected: string[], hidden: string[] = []): void {
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button[data-id]')) {
      b.classList.toggle('selected', selected.includes(b.dataset.id!));
      b.style.display = hidden.includes(b.dataset.id!) ? 'none' : '';
    }
  }

  show(layout: PadLayout | null, firstTime = false): void {
    this.layout = layout;
    this.stopAll();
    if (!layout) {
      this.el.classList.remove('show');
      this.toggleHelp(false);
      return;
    }
    this.el.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'pad-head';
    head.innerHTML = `<div class="pad-title"><b>${layout.title}</b> <span>${layout.hint}</span></div>`;
    const extras = document.createElement('div');
    extras.className = 'pad-extras';
    for (const b of layout.extras) extras.appendChild(this.button(b, 'pad-mini'));
    head.appendChild(extras);
    this.el.appendChild(head);
    for (const row of layout.rows) {
      const r = document.createElement('div');
      r.className = 'pad-row';
      for (const b of row) r.appendChild(this.button(b, 'pad-btn'));
      this.el.appendChild(r);
    }
    this.el.classList.add('show');
    this.renderHelp(layout);
    if (firstTime) this.toggleHelp(true);
  }

  private button(b: PadButton, cls: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${cls}${b.wide ? ' wide' : ''}${b.id === 'drop' ? ' accent' : ''}`;
    btn.title = b.tip;
    btn.dataset.id = b.id;
    btn.setAttribute('aria-label', b.tip);
    btn.innerHTML = `<span class="lbl">${b.label}</span>${b.key ? `<kbd>${b.key}</kbd>` : ''}`;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (b.id === 'help') return this.toggleHelp(true);
      this.onAction(b.id);
      if (b.repeat) {
        const tick = () => {
          this.onAction(b.id);
          this.timers.set(b.id, window.setTimeout(tick, b.id === 'down' ? 55 : 110));
        };
        this.timers.set(b.id, window.setTimeout(tick, 260));
      }
    });
    const stop = () => {
      const held = this.timers.has(b.id) || b.repeat;
      clearTimeout(this.timers.get(b.id));
      this.timers.delete(b.id);
      // games that steer while a button is held get a release event ("left:up")
      if (held && b.repeat && btn.dataset.down === '1') this.onAction(`${b.id}:up`);
      btn.dataset.down = '0';
    };
    btn.addEventListener('pointerdown', () => (btn.dataset.down = '1'));
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    return btn;
  }

  private renderHelp(layout: PadLayout): void {
    this.sheet.innerHTML = `<div class="howto-card" role="dialog" aria-label="How to play ${layout.title}">
      <h2>How to play ${layout.title}</h2><p class="howto-hint">${layout.hint}</p>
      <div class="howto-grid">${layout.help.map((s) => `<section><h3>${s.head}</h3><ul>${s.lines.map((l) => `<li>${l}</li>`).join('')}</ul></section>`).join('')}</div>
      <button type="button" class="primary" data-close>Got it</button></div>`;
  }

  toggleHelp(on = !this.sheet.classList.contains('show')): void {
    this.sheet.classList.toggle('show', on && !!this.layout);
  }

  get helpOpen(): boolean {
    return this.sheet.classList.contains('show');
  }

  private stopAll(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

const BACK = { id: 'exit', label: 'Back to build', key: 'Esc', tip: 'Leave the game (Esc)' };
const HELP = { id: 'help', label: 'How to play', key: '?', tip: 'Show all controls' };
const PAUSE = { id: 'pause', label: 'Pause', key: 'P', tip: 'Pause / resume (P)' };
const NEW = { id: 'start', label: 'New game', key: 'N', tip: 'Start over (N)' };

export const GALAGO_PAD: PadLayout = {
  title: 'Galago',
  hint: 'Blast the alien swarm before it dives into you. Clear a wave to warp to the next.',
  rows: [
    [
      { id: 'left', label: 'Left', key: '←', tip: 'Move left (← or A)', repeat: true },
      { id: 'up', label: 'Up', key: '↑', tip: 'Move up (↑ or W)', repeat: true },
      { id: 'down', label: 'Down', key: '↓', tip: 'Move down (↓ or S)', repeat: true },
      { id: 'right', label: 'Right', key: '→', tip: 'Move right (→ or D)', repeat: true },
      { id: 'fire', label: 'Fire', key: 'Space', tip: 'Fire (hold Space)', repeat: true, wide: true },
    ],
  ],
  extras: [NEW, PAUSE, HELP, BACK],
  help: [
    { head: 'Keyboard', lines: ['Arrows or WASD move your ship', 'Hold Space to fire', 'N new game · P pause · Esc back'] },
    { head: 'Mouse or touch', lines: ['Press and drag to fly — your ship fires while you hold', 'Or use the buttons'] },
    { head: 'Quest — hands', lines: ['Pinch and move your hand to fly the ship', 'Your ship fires while you keep pinching', 'Poke NEW GAME / PAUSE on the desk'] },
    { head: 'Quest — controllers', lines: ['Hold the trigger and move the controller to fly + fire', 'Thumbstick also flies the ship · A/X fires'] },
  ],
};

export const MAZE_PAD: PadLayout = {
  title: 'Marble Maze',
  hint: 'Tilt the board to roll the marble to the glowing goal. Avoid the holes!',
  rows: [
    [
      { id: 'left', label: 'Tilt left', key: '←', tip: 'Tilt left (hold ← or A)', repeat: true },
      { id: 'up', label: 'Tilt away', key: '↑', tip: 'Tilt away from you (hold ↑ or W)', repeat: true },
      { id: 'down', label: 'Tilt toward', key: '↓', tip: 'Tilt toward you (hold ↓ or S)', repeat: true },
      { id: 'right', label: 'Tilt right', key: '→', tip: 'Tilt right (hold → or D)', repeat: true },
    ],
  ],
  extras: [
    { id: 'retry', label: 'Retry', key: 'R', tip: 'Restart this maze (R)' },
    { id: 'next', label: 'Skip', key: 'N', tip: 'Skip to the next maze (N)' },
    HELP,
    BACK,
  ],
  help: [
    { head: 'Keyboard', lines: ['Hold the arrows (or WASD) to tilt the board', 'R retry · N skip · Esc back'] },
    { head: 'Mouse or touch', lines: ['Press and drag: the board tilts the way you drag', 'Let go to level it out'] },
    { head: 'Quest — hands', lines: ['Pinch anywhere and push your hand the way the marble should roll', 'Open your fingers to level the board'] },
    { head: 'Quest — controllers', lines: ['Thumbstick tilts the board', 'Or hold the trigger and move the controller'] },
  ],
};

export const WHACK_PAD: PadLayout = {
  title: 'Whack-a-Gloom',
  hint: 'Bop the gloomlings as they pop up. Gold ones are worth 3 — don’t bop the pebbles!',
  rows: [
    [
      { id: 'hole0', label: 'Back left', key: 'Q', tip: 'Bop back-left hole (Q)' },
      { id: 'hole1', label: 'Back', key: 'W', tip: 'Bop back-middle hole (W)' },
      { id: 'hole2', label: 'Back right', key: 'E', tip: 'Bop back-right hole (E)' },
    ],
    [
      { id: 'hole3', label: 'Left', key: 'A', tip: 'Bop middle-left hole (A)' },
      { id: 'hole4', label: 'Middle', key: 'S', tip: 'Bop middle hole (S)' },
      { id: 'hole5', label: 'Right', key: 'D', tip: 'Bop middle-right hole (D)' },
    ],
    [
      { id: 'hole6', label: 'Front left', key: 'Z', tip: 'Bop front-left hole (Z)' },
      { id: 'hole7', label: 'Front', key: 'X', tip: 'Bop front-middle hole (X)' },
      { id: 'hole8', label: 'Front right', key: 'C', tip: 'Bop front-right hole (C)' },
    ],
  ],
  extras: [NEW, PAUSE, HELP, BACK],
  help: [
    { head: 'Keyboard', lines: ['The holes match Q W E / A S D / Z X C', 'N new game · P pause · Esc back'] },
    { head: 'Mouse or touch', lines: ['Click or tap a gloomling to bop it'] },
    { head: 'Quest — hands', lines: ['Poke a gloomling with your finger (or pinch it)', 'Use both hands!'] },
    { head: 'Quest — controllers', lines: ['Touch a gloomling with the controller tip and pull the trigger'] },
  ],
};

export const BREAKOUT_PAD: PadLayout = {
  title: 'Breakout 3D',
  hint: 'Your paddle is the glass square at the front. Bounce the ball into the brick wall.',
  rows: [
    [
      { id: 'left', label: 'Left', key: '←', tip: 'Move paddle left (← or A)', repeat: true },
      { id: 'up', label: 'Up', key: '↑', tip: 'Move paddle up (↑ or W)', repeat: true },
      { id: 'down', label: 'Down', key: '↓', tip: 'Move paddle down (↓ or S)', repeat: true },
      { id: 'right', label: 'Right', key: '→', tip: 'Move paddle right (→ or D)', repeat: true },
      { id: 'fire', label: 'Launch', key: 'Space', tip: 'Launch the ball (Space)', wide: true },
    ],
  ],
  extras: [NEW, { id: 'next', label: 'Skip level', key: 'K', tip: 'Skip to the next level (K)' }, PAUSE, HELP, BACK],
  help: [
    { head: 'Keyboard', lines: ['Arrows or WASD move the paddle', 'Space launches the ball', 'N new game · K skip · P pause · Esc back'] },
    { head: 'Mouse or touch', lines: ['Move / drag to steer the paddle, click or tap to launch'] },
    { head: 'Quest — hands', lines: ['Hold your hand up in front of you — the paddle follows it', 'Pinch to launch the ball'] },
    { head: 'Quest — controllers', lines: ['The paddle follows your controller', 'Trigger launches · thumbstick also moves the paddle'] },
  ],
};

export const TOWER_PAD: PadLayout = {
  title: 'Block Tower',
  hint: 'Pull a block out without toppling the tower, then put it on top. How tall can you go?',
  rows: [
    [
      { id: 'prev', label: 'Pick ◀', key: '←', tip: 'Highlight the previous block (←)' },
      { id: 'up', label: 'Layer up', key: '↑', tip: 'Highlight a block one layer up (↑)' },
      { id: 'down', label: 'Layer down', key: '↓', tip: 'Highlight a block one layer down (↓)' },
      { id: 'nextBlock', label: 'Pick ▶', key: '→', tip: 'Highlight the next block (→)' },
      { id: 'push', label: 'Push out', key: 'Space', tip: 'Give the highlighted block a gentle push (Space)', repeat: true },
      { id: 'totop', label: 'To top', key: 'T', tip: 'Put the pulled-out block on top of the tower (T)' },
    ],
  ],
  extras: [NEW, HELP, BACK],
  help: [
    { head: 'Keyboard', lines: ['Arrows pick a block, Space pushes it out a little', 'T puts the block that sticks out on top', 'N new tower · Esc back'] },
    { head: 'Mouse or touch', lines: ['Click a block to push it out a little; drag to pull it', 'Then press To top'] },
    { head: 'Quest — hands', lines: ['Pinch a block and slowly pull it out', 'Let go above the tower to stack it (or poke TO TOP)'] },
    { head: 'Quest — controllers', lines: ['Touch a block, hold the trigger, and pull'] },
  ],
};

export const ARCADE_PAD: PadLayout = {
  title: 'Arcade',
  hint: 'Pick a game. Each one works with hands, controllers, mouse, touch and keyboard.',
  rows: [
    [
      { id: 'galago', label: 'Galago', key: '1', tip: 'Space shooter (1)' },
      { id: 'maze', label: 'Marble Maze', key: '2', tip: 'Tilt the board (2)' },
      { id: 'whack', label: 'Whack-a-Gloom', key: '3', tip: 'Bop the gloomlings (3)' },
      { id: 'breakout', label: 'Breakout 3D', key: '4', tip: '3D brick breaker (4)' },
    ],
    [
      { id: 'tower', label: 'Block Tower', key: '5', tip: 'Pull blocks, stack on top (5)' },
      { id: 'fappy', label: 'Fappy Bro', key: '6', tip: 'First-person flapper (6)' },
      { id: 'penguin', label: 'Mike Penguin', key: '7', tip: 'First-person ice run (7)' },
    ],
  ],
  extras: [HELP, BACK],
  help: [
    { head: 'Pick a game', lines: ['Click a button, press 1–7, or say “play galago”, “marble maze”, “mike penguin”…', 'Esc (or Back to build) returns to your desk, untouched'] },
    { head: 'Quest', lines: ['Poke or pinch a tile on the desk', 'The column on the left edge of the desk switches modes any time'] },
  ],
};

export const FAPPY_PAD: PadLayout = {
  title: 'Fappy Bro',
  hint: 'You are the bird. Flap to rise, fall between flaps, and fly through the gaps.',
  rows: [[{ id: 'flap', label: 'Flap', key: 'Space', tip: 'Flap (Space, click, tap)', wide: true }]],
  extras: [NEW, PAUSE, HELP, BACK],
  help: [
    { head: 'Keyboard', lines: ['Space, ↑ or W flaps', 'N new game · P pause · Esc back'] },
    { head: 'Mouse or touch', lines: ['Click or tap anywhere on the game to flap'] },
    { head: 'Quest — hands', lines: ['Pinch to flap (either hand)', 'Or flap a hand down quickly', 'Sit still: the world moves, you do not'] },
    { head: 'Quest — controllers', lines: ['Trigger or A/X flaps'] },
  ],
};

export const PENGUIN_PAD: PadLayout = {
  title: 'Mike Penguin',
  hint: 'Run the ice road: dodge seals and cracks, jump the holes, grab fish, beat the clock to each flag.',
  rows: [
    [
      { id: 'left', label: 'Left', key: '←', tip: 'Step left (← or A)' },
      { id: 'jump', label: 'Jump', key: 'Space', tip: 'Jump (Space or ↑)', wide: true },
      { id: 'right', label: 'Right', key: '→', tip: 'Step right (→ or D)' },
      { id: 'down', label: 'Slow', key: '↓', tip: 'Hold to slow down (↓ or S)', repeat: true },
    ],
  ],
  extras: [NEW, PAUSE, HELP, BACK],
  help: [
    { head: 'Keyboard', lines: ['← → change lane · Space or ↑ jump · hold ↓ slow down', 'N new game · P pause · Esc back'] },
    { head: 'Mouse or touch', lines: ['Tap the left / right side to change lane, swipe up or tap the middle to jump'] },
    { head: 'Quest — hands', lines: ['Pinch and swipe left / right to change lane', 'Quick pinch (or lift your hand) to jump'] },
    { head: 'Quest — controllers', lines: ['Thumbstick left / right changes lane', 'Trigger or A/X jumps · pull stick back to slow'] },
  ],
};
