/**
 * First five minutes: teach by doing, one action at a time, no menus, no walls of text.
 *   grab a glowing block -> ask Naga for a house -> slide the roof -> undo -> free play
 */
import type { DockAction } from './ui/dock.js';

export type OnboardEvent = 'carried' | 'built' | 'undo' | 'placed' | 'painted' | 'deleted' | 'detached';

interface Step {
  id: string;
  hint: string;
  say: string;
  attention: DockAction | null;
  done: OnboardEvent[];
}

export interface OnboardingHost {
  say(text: string): void;
  hint(text: string): void;
  attention(id: DockAction | null): void;
  chime(): void;
  spawnStarterBlock(): void;
  voiceReady(): boolean;
}

const KEY = 'naga-atelier:onboarded:v1';

export class Onboarding {
  private i = -1;
  private steps: Step[];
  private stepStart = 0;
  private nudged = false;
  active = false;

  constructor(private host: OnboardingHost) {
    this.steps = [
      { id: 'grab', say: "Hi, I'm Naga. Let's build on your desk.", hint: 'Pinch the glowing block and drag it', attention: null, done: ['carried'] },
      { id: 'voice', say: 'Nice! Now ask me for something.', hint: 'Tap the mic and say “Build a small house”', attention: 'mic', done: ['built'] },
      { id: 'roof', say: 'I drafted it — now make it yours.', hint: 'Pinch the roof and slide it', attention: null, done: ['carried'] },
      { id: 'undo', say: 'Changed your mind? Easy.', hint: 'Tap undo to put it back', attention: 'undo', done: ['undo'] },
    ];
  }

  static seen(): boolean {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  }

  start(force = false): void {
    if (!force && Onboarding.seen()) {
      this.active = false;
      this.host.say('Welcome back. What shall we build?');
      return;
    }
    this.active = true;
    this.i = -1;
    this.host.spawnStarterBlock();
    this.next();
  }

  private next(): void {
    this.i++;
    this.nudged = false;
    this.stepStart = performance.now();
    if (this.i >= this.steps.length) {
      this.active = false;
      this.host.attention(null);
      this.host.hint('');
      this.host.chime();
      this.host.say("You've got it. Tap to add blocks, hold one to pull it free.");
      try {
        localStorage.setItem(KEY, '1');
      } catch {
        /* private mode */
      }
      return;
    }
    const s = this.steps[this.i];
    if (s.id === 'voice' && !this.host.voiceReady()) {
      s.hint = 'Tap the ★ star and I’ll draft a house';
      s.attention = 'magic';
    }
    if (this.i > 0) this.host.chime();
    this.host.say(s.say);
    this.host.hint(s.hint);
    this.host.attention(s.attention);
  }

  /** Called every frame; nudges toward the hands-only path if voice seems stuck. */
  tick(now: number): void {
    if (!this.active || this.nudged) return;
    const s = this.steps[this.i];
    if (s?.id === 'voice' && now - this.stepStart > 25000) {
      this.nudged = true;
      this.host.hint('Say “Build a small house” — or tap the ★ star');
    }
  }

  event(e: OnboardEvent): void {
    if (!this.active) return;
    const s = this.steps[this.i];
    if (s && s.done.includes(e)) this.next();
  }
}
