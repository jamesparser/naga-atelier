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
  hint: 'Fill a straight row left-to-right to blast it. The well is 4 rows deep: use Back/Front to change row.',
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
    { id: 'pause', label: 'Pause', key: 'P', tip: 'Pause / resume (P)' },
    { id: 'help', label: 'How to play', key: '?', tip: 'Show all controls' },
    { id: 'exit', label: 'Back to build', key: 'Esc', tip: 'Leave the game (Esc)' },
  ],
  help: [
    { head: 'Keyboard', lines: ['← → move left / right', '↑ ↓ move to the back / front row', 'Q or E spin · R flip · F tilt', 'Shift hold = faster · Space = drop', 'P pause · Esc back to build'] },
    { head: 'Mouse or touch', lines: ['Drag on the game to slide the piece', 'Quick click / tap = spin', 'Use the buttons for flip, tilt, drop'] },
    { head: 'Quest — hands', lines: ['Pinch anywhere and move your hand to slide the piece', 'Pinch and twist your wrist to flip it', 'Quick pinch = spin · flick down = drop', 'Poke the labelled buttons on the desk'] },
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
      clearTimeout(this.timers.get(b.id));
      this.timers.delete(b.id);
    };
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
