import type {Animation, Pack} from '../../src/policy';

export type SequenceStep = {action: string; caption?: string};
export interface Clock {
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
}

/** Playback time starts on a decoded, drawn frame, never on a menu click. */
export class Sequence {
  private steps: SequenceStep[] = [];
  private index = -1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private waiting = false;
  private generation = 0;
  constructor(private pack: Pack, private play: (action: string) => void, private done: () => void, private clock: Clock = globalThis) {}
  get step(): SequenceStep | undefined { return this.steps[this.index]; }
  get running(): boolean { return this.index >= 0; }
  start(steps: readonly SequenceStep[]): boolean {
    this.cancel();
    if (!steps.length || steps.some(s => !this.pack.animations[s.action])) return false;
    this.steps = steps.map(s => ({...s}));
    this.index = 0;
    this.next();
    return true;
  }
  /** Called by Player's label callback after the action's first actual draw. */
  drawn(action: string): void {
    if (!this.running || !this.waiting || this.step?.action !== action) return;
    this.waiting = false;
    const a: Animation = this.pack.animations[action], revision = this.generation;
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      if (revision !== this.generation || !this.running) return;
      if (++this.index < this.steps.length) this.next();
      else { this.cancel(); this.done(); }
    }, a.frames / a.fps * 1000);
  }
  cancel(): void {
    ++this.generation;
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.steps = [];
    this.index = -1;
    this.waiting = false;
  }
  private next(): void { this.waiting = true; this.play(this.step!.action); }
}
