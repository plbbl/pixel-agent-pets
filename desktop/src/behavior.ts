import type {Activity, Character, Pack} from '../../src/policy';
import {idleActions} from '../../src/policy';
import {signatureStory} from '../../src/stories';
import type {SequenceStep} from './sequence';

export type Follow = 'auto' | 'codex' | 'dsh' | 'off';
export type ActivitySnapshot = Activity & {source: 'codex' | 'dsh' | null; observedAt: number; owner?: string; chineseInputId?: string};
export type BehaviorMode = 'idle' | 'greeting' | 'autonomous' | 'interaction' | 'manual' | 'work' | 'feedback' | 'sleep';
export interface BehaviorPort {
  play(steps: readonly SequenceStep[], mode: BehaviorMode, title?: string): boolean;
  cancel(): void;
  activity(value: Activity, reset: boolean): void;
  freeze(): void;
  changed(mode: BehaviorMode): void;
}
export interface BehaviorClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
}
export type BehaviorTiming = {sleepAfter?: number; idleDelay?: number};
const realClock: BehaviorClock = {now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id)};
export const noActivity = (): ActivitySnapshot => ({busy: false, phase: 'thinking', source: null, observedAt: 0});
const phases = ['sending', 'preparing', 'thinking', 'responding', 'tools', 'retrying', 'stopping'];
const token = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,160}$/.test(value) ? value : undefined;

/** Only structured, ephemeral display facts cross the native bridge. */
export function activitySnapshot(value: unknown): ActivitySnapshot {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const source = input.source === 'codex' || input.source === 'dsh' ? input.source : null;
  if (!source) return noActivity();
  return {source, observedAt: typeof input.observedAt === 'number' && Number.isFinite(input.observedAt) ? input.observedAt : 0,
    busy: input.busy === true, phase: phases.includes(String(input.phase)) ? input.phase as Activity['phase'] : 'thinking',
    awaitingInput: input.awaitingInput === true, chineseDraft: input.chineseDraft === true,
    owner: token(input.owner), tool: token(input.tool), toolId: token(input.toolId), turnId: token(input.turnId), errorId: token(input.errorId), chineseInputId: token(input.chineseInputId)};
}

/** One owner at a time. Interaction never invents a CLI operation. */
export class Behavior {
  private mode: BehaviorMode = 'idle';
  private facts = noActivity();
  private latest = noActivity();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private active = true;
  private hovering = false;
  private dragging = false;
  private sleeping = false;
  private routine = 0;
  private touches = 0;
  private lastTouch = -Infinity;
  private lastHover = -Infinity;
  private lastChinese = -Infinity;
  private chineseIds = new Set<string>();
  private pendingChinese = false;
  private engagedAt: number;
  private lastAction = '';
  constructor(private character: Character, private pack: Pack, private port: BehaviorPort, private follow: Follow = 'auto', private motion = true, private clock: BehaviorClock = realClock, private timing: BehaviorTiming = {}) {
    this.engagedAt = clock.now();
  }
  get state() { return this.mode; }
  get working() { return this.facts.busy || this.facts.awaitingInput === true; }
  get source() { return this.facts.source; }
  get manualAvailable() { return !this.working && this.mode !== 'feedback'; }

  start(value: ActivitySnapshot, greet = true) {
    this.activity(value);
    if (this.mode !== 'idle') return;
    this.run([{action: greet ? this.character === 'clawd' ? 'Waving' : this.character === 'gpt' ? 'wave' : 'happy' : this.character === 'clawd' ? 'LookingAroundEyesOnly' : 'idle', caption: greet ? '你好呀。' : undefined}], greet ? 'greeting' : 'interaction');
  }

  setFollow(value: Follow) {
    if (this.follow === value) return;
    this.follow = value;
    this.stopOwned(); this.sleeping = false; this.pendingChinese = false;
    this.facts = noActivity(); this.port.activity(this.facts, true); this.setMode('idle');
    this.activity(this.latest);
    if (this.mode === 'idle') this.schedule();
  }

  activity(value: ActivitySnapshot) {
    if (!this.active) return;
    if (value.source === this.latest.source && value.owner === this.latest.owner && value.observedAt < this.latest.observedAt) return;
    this.latest = value;
    if (this.follow === 'off') value = noActivity();
    else if (this.follow !== 'auto' && value.source && value.source !== this.follow) return;
    const old = this.facts, sourceChanged = old.source !== value.source || old.owner !== value.owner;
    this.facts = value;
    if (this.character === 'claude' && value.chineseDraft) {
      const key = value.chineseInputId ? value.source + ':' + value.chineseInputId : undefined;
      if (key && !this.chineseIds.has(key)) {
        this.chineseIds.add(key); if (this.chineseIds.size > 32) this.chineseIds.delete(this.chineseIds.values().next().value!);
        // Record every input, but do not replay a long show for rapid messages.
        if (this.clock.now() - this.lastChinese >= 20000) this.pendingChinese = true;
      } else if (!key && !old.chineseDraft && this.clock.now() - this.lastChinese >= 20000) this.pendingChinese = true;
    }
    const unchanged = (Object.keys(value) as (keyof ActivitySnapshot)[]).every(key => key === 'observedAt' || value[key] === old[key]) &&
      (Object.keys(old) as (keyof ActivitySnapshot)[]).every(key => key === 'observedAt' || value[key] === old[key]);
    if (unchanged) return;
    const active = this.working, wasActive = old.busy || old.awaitingInput === true;
    // CJK is a local presentation trigger, owned here so it cannot interrupt a manual show twice.
    const display = {...value, chineseDraft: false};
    if (active) {
      this.engagedAt = this.clock.now(); this.sleeping = false; this.stopOwned(); this.setMode('work');
      this.port.activity(display, sourceChanged); return;
    }
    const terminal = !sourceChanged && old.busy && !value.busy ||
      value.errorId && (sourceChanged || value.errorId !== old.errorId) ||
      value.phase === 'stopping' && (sourceChanged || old.phase !== 'stopping' || old.turnId !== value.turnId);
    if (terminal) {
      this.engagedAt = this.clock.now(); this.sleeping = false; this.stopOwned(); this.setMode('feedback');
      this.port.activity(display, sourceChanged); return;
    }
    // Only actual work may wake a pose held by an OS-owned drag gesture.
    if (this.dragging) return;
    if (this.sleeping && !this.pendingChinese) return;
    if (sourceChanged && (wasActive || this.mode === 'feedback')) {
      this.stopOwned(); this.sleeping = false; this.setMode('idle'); this.port.activity(display, true); this.schedule();
    } else {
      this.port.activity(display, false);
      if (this.mode === 'work') { this.engagedAt = this.clock.now(); this.setMode('idle'); this.schedule(); }
    }
    if (this.playPendingChinese()) return;
    if (this.mode === 'idle' && this.timer === undefined) this.schedule();
  }

  /** Real terminal clips are also complete-playback animations. */
  drawn(action: string) {
    if (this.mode !== 'feedback' || this.motion || this.timer !== undefined) return;
    const a = this.pack.animations[action];
    if (a) this.timer = this.clock.setTimeout(() => { this.timer = undefined; this.completed(); }, a.frames / a.fps * 1000);
  }
  completed() {
    if (this.mode === 'feedback') { this.setMode('idle'); if (!this.playPendingChinese()) this.schedule(); }
  }
  sequenceDone() {
    if (!this.active || this.working) return;
    const sleep = this.lastAction === 'sleep' || this.mode === 'sleep';
    if (['greeting', 'interaction', 'manual'].includes(this.mode)) this.engagedAt = this.clock.now();
    this.setMode('idle');
    if (this.playPendingChinese()) return;
    if (sleep) {
      this.sleeping = true; this.setMode('sleep'); this.port.freeze(); return;
    }
    this.setMode('idle'); this.schedule(); if (this.hovering) this.hover(true);
  }

  manual(steps: readonly SequenceStep[], title?: string) {
    if (this.working || this.mode === 'feedback') return false;
    this.engagedAt = this.clock.now(); return this.run(steps, 'manual', title);
  }
  pet() {
    if (!this.active || this.working || this.mode === 'feedback' || this.dragging) return false;
    const now = this.clock.now(), waking = this.sleeping;
    this.touches = now - this.lastTouch <= 6000 ? this.touches + 1 : 1;
    this.lastTouch = now; this.engagedAt = now;
    const n = Math.min(3, this.touches - 1);
    const actions: Record<Character, string[]> = {
      claude: ['happy', 'confused', 'dance', 'error'], gpt: ['wave', 'happy', 'idea', 'gate'],
      deepseek: ['happy', 'hungry', 'riceHappy', 'pile'], clawd: ['Waving', 'JumpingHappy', 'Confetti', 'Facepalm'],
    };
    const caption = waking ? '醒啦。' : this.touches >= 4 ? this.character === 'gpt' ? '先确认摸摸权限……' : this.character === 'deepseek' ? '摸摸换饭……' : '好啦好啦……' : this.touches === 1 ? '摸摸。' : '嗯？';
    return this.run([{action: actions[this.character][waking ? 0 : n], caption}], 'interaction');
  }
  hover(inside: boolean) {
    this.hovering = inside;
    this.clearHover();
    if (!inside) { if (this.mode === 'idle') this.schedule(); return; }
    if (!this.active || this.working || this.mode !== 'idle' || this.clock.now() - this.lastHover < 20000) return;
    this.clearTimer();
    this.hoverTimer = this.clock.setTimeout(() => {
      this.hoverTimer = undefined;
      if (!this.hovering || this.mode !== 'idle' || this.working) return;
      this.lastHover = this.clock.now(); this.engagedAt = this.clock.now();
      const action = this.character === 'clawd' ? 'LookingAround' : this.character === 'claude' ? 'confused' : this.character === 'deepseek' ? 'hungry' : 'idle';
      this.run([{action, caption: this.character === 'deepseek' ? '开饭了吗？' : '在看我吗？'}], 'interaction');
    }, 700);
  }
  dragStart() {
    if (!this.active) return;
    this.dragging = true; this.engagedAt = this.clock.now();
    if (!this.working && this.mode !== 'feedback') { this.stopOwned(); this.port.freeze(); this.setMode('interaction'); }
  }
  drop(distance: number) {
    if (!this.active) return;
    this.dragging = false;
    if (this.working || this.mode === 'feedback') return;
    this.engagedAt = this.clock.now();
    const large = distance >= 160;
    const action = this.character === 'clawd' ? large ? 'Dizzy' : 'Jumping' : large ? 'error' : 'happy';
    this.run([{action, caption: large ? this.character === 'deepseek' ? '饭要洒了……' : '轻一点……' : '落地。'}], 'interaction');
  }
  dispose() { this.active = false; this.clearTimer(); this.clearHover(); }

  private run(steps: readonly SequenceStep[], mode: BehaviorMode, title?: string) {
    if (!this.active || this.working || !steps.length || steps.some(step => !this.pack.animations[step.action])) return false;
    this.stopOwned(); this.sleeping = false; this.lastAction = steps.at(-1)!.action; this.setMode(mode);
    if (this.port.play(steps, mode, title)) return true;
    this.setMode('idle'); this.schedule(); return false;
  }
  private playPendingChinese() {
    if (!this.pendingChinese || this.working || this.mode === 'manual' || this.mode === 'feedback') return false;
    if (this.clock.now() - this.lastChinese < 20000) { this.pendingChinese = false; return false; }
    this.pendingChinese = false; this.lastChinese = this.clock.now();
    return this.run(signatureStory('claude').steps, 'autonomous', '中文彩蛋');
  }
  private schedule() {
    this.clearTimer();
    if (!this.active || this.working || this.sleeping || this.dragging || this.mode !== 'idle') return;
    const delay = this.timing.idleDelay ?? (this.motion ? 6500 : 12000) + this.routine % 4 * 800;
    this.timer = this.clock.setTimeout(() => { this.timer = undefined; this.autonomous(); }, delay);
  }
  private autonomous() {
    if (!this.active || this.working || this.mode !== 'idle') return;
    if (this.clock.now() - this.engagedAt >= (this.timing.sleepAfter ?? 120000)) {
      const action = this.character === 'clawd' ? 'Meditating' : this.character === 'claude' ? 'reading' : 'sleep';
      this.run([{action, caption: this.character === 'clawd' || this.character === 'claude' ? '休息一下……' : undefined}], 'sleep'); return;
    }
    const n = this.routine++;
    let steps: readonly SequenceStep[];
    if (this.character === 'clawd') steps = [{action: idleActions.clawd[n % idleActions.clawd.length]}];
    else if (this.character === 'claude') steps = [[{action: 'idle'}], [{action: 'confused'}, {action: 'thinking'}], [{action: 'reading'}], [{action: 'dance'}]][n % 4];
    else if (this.character === 'gpt') steps = n % 3 === 1 ? signatureStory('gpt').steps : n % 3 === 2 ? [{action: 'snapshot'}, {action: 'idea'}] : [{action: 'idle'}];
    else steps = [[{action: 'hungry'}, {action: 'rice'}, {action: 'riceHappy'}], [{action: 'empty'}, {action: 'steal', caption: '去找饭了……'}, {action: 'rice'}], [{action: 'pile'}, {action: 'riceHappy'}], [{action: 'fast'}, {action: 'chain', caption: '雷霆思维链小剧场……'}]][n % 4];
    this.run(steps, 'autonomous', '自主小剧场');
  }
  private stopOwned() { this.clearTimer(); this.clearHover(); this.port.cancel(); }
  private setMode(mode: BehaviorMode) { this.mode = mode; this.port.changed(mode); }
  private clearTimer() { if (this.timer !== undefined) this.clock.clearTimeout(this.timer); this.timer = undefined; }
  private clearHover() { if (this.hoverTimer !== undefined) this.clock.clearTimeout(this.hoverTimer); this.hoverTimer = undefined; }
}
