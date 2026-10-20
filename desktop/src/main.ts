import './style.css';
import {Player} from '../../src/player';
import {names, type Character, type Pack} from '../../src/policy';
import {petResolution} from '../../src/pet-view';
import {signatureStory, storyTimeline} from '../../src/stories';
import {localAssets} from './assets';
import {call, commands, native, type NativePreferences, type PetCommand} from './native';
import {characters, geometry, preferences, qualities, readPreferences, savePreferences, type Preferences} from './preferences';
import {Sequence} from './sequence';

const stage = document.querySelector<HTMLElement>('#stage')!;
const actor = document.querySelector<HTMLButtonElement>('#actor')!;
const canvas = document.querySelector<HTMLCanvasElement>('#pet')!;
const caption = document.querySelector<HTMLElement>('#caption')!;
const menu = document.querySelector<HTMLElement>('#menu')!;
const playerCaption = document.createElement('span');
const assets = localAssets();
const storage = {getItem(key: string) { return localStorage.getItem(key); }, setItem(key: string, value: string) { localStorage.setItem(key, value); }};
let prefs = readPreferences(storage), player: Player | undefined, pack: Pack | undefined, sequence: Sequence | undefined;
let visible = true, disposed = false, loading = 0, interaction = 0, drawn = false, smoke = false;
let clickTimer: ReturnType<typeof setTimeout> | undefined;
let readinessRAF: number | undefined, unlisten: (() => void) | undefined;
let drag: {x: number; y: number; started: boolean} | undefined, suppressClickUntil = 0;
let started = false;
const startupCommands: PetCommand[] = [];

function report(error: unknown) {
  console.error('抱抱龙桌宠:', error instanceof Error ? error.message : 'Local operation failed');
}

function sync() {
  if (smoke) return;
  savePreferences(storage, prefs);
  void call('sync_preferences', {...prefs, storyAvailable: true, storyTitle: signatureStory(prefs.character).title}).catch(report);
}

function fit() {
  const bounds = geometry(prefs.size);
  stage.style.width = bounds.width + 'px'; stage.style.height = bounds.height + 'px';
  actor.style.width = actor.style.height = prefs.size + 'px';
  actor.style.left = (bounds.width - prefs.size) / 2 + 'px';
  stage.dataset.size = String(prefs.size);
  stage.dataset.quality = prefs.quality;
  stage.dataset.effectiveQuality = String(petResolution(prefs, devicePixelRatio, prefs.character === 'clawd'));
  void call('window_fit', bounds).catch(report);
}

function setView(value: Partial<Preferences>) {
  prefs = preferences({...prefs, ...value});
  fit(); player?.setView(prefs); sync();
}

function updateCaption() {
  if (caption.hasAttribute('data-error')) return;
  const override = sequence?.step?.caption;
  const text = override ?? playerCaption.textContent ?? '';
  if (caption.textContent !== text) caption.textContent = text;
  stage.dataset.action = canvas.dataset.action ?? '';
  stage.dataset.resolution = canvas.dataset.resolution ?? '';
}

/** Smoke success means visible pixel alpha, not merely DOM or decoded metadata. */
function firstPaint() {
  if (smoke || drawn || disposed || !visible || document.hidden || readinessRAF !== undefined) return;
  readinessRAF = requestAnimationFrame(() => {
    readinessRAF = undefined;
    if (drawn || disposed || !visible || document.hidden) return;
    let pixels = 0;
    try {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i]) ++pixels;
    } catch (error) { report(error); return; }
    if (!pixels) { firstPaint(); return; }
    drawn = true; stage.dataset.ready = 'true';
    void call('pet_drawn', {character: canvas.dataset.character, action: canvas.dataset.action,
      width: canvas.width, height: canvas.height, drawnPixels: pixels}).catch(report);
  });
}

// Player writes captions and frame facts. Observing these avoids a second clock.
const drawing = new MutationObserver(() => { updateCaption(); firstPaint(); });
drawing.observe(canvas, {attributes: true, attributeFilter: ['data-frame', 'data-action', 'data-resolution']});
const captions = new MutationObserver(updateCaption);
captions.observe(playerCaption, {childList: true, characterData: true, subtree: true});

function resetSequence() {
  sequence?.cancel(); delete stage.dataset.story;
  if (clickTimer !== undefined) clearTimeout(clickTimer); clickTimer = undefined;
}

function preview(action: string) {
  if (!player || !pack?.animations[action] || !visible || document.hidden) return;
  // A repeated selection must replay from frame zero. The intermediate request
  // is superseded before its image resolves, so it never paints an extra pose.
  if (canvas.dataset.action === action) {
    const alternate = Object.keys(pack.animations).find(a => a !== action);
    if (alternate) player.preview(alternate);
  }
  player.preview(action);
}

function makePlayer() {
  if (!pack || !visible || disposed) return;
  player?.dispose();
  const currentCharacter = prefs.character;
  sequence = new Sequence(pack, preview, () => { delete stage.dataset.story; updateCaption(); });
  player = new Player(canvas, currentCharacter, pack, playerCaption, title => {
    if (currentCharacter !== prefs.character || disposed) return;
    caption.removeAttribute('data-error');
    canvas.setAttribute('aria-label', names[currentCharacter] + ' · ' + title);
    sequence?.drawn(canvas.dataset.action ?? '');
    updateCaption(); firstPaint();
  }, assets.hd, assets.hdURL);
  player.setView(prefs);
}

async function setCharacter(character: Character) {
  const revision = ++loading;
  try {
    const next = await assets.pack(character);
    if (disposed || revision !== loading) return;
    resetSequence(); player?.dispose(); player = undefined;
    prefs = preferences({...prefs, character}); pack = next; interaction = 0;
    actor.setAttribute('aria-label', names[character] + '，单击互动，双击完整演出，右键设置');
    fit(); makePlayer(); sync();
  } catch (error) {
    if (disposed || revision !== loading) return;
    caption.dataset.error = 'true'; caption.textContent = '资源未载入，右键重选角色';
    report(error);
  }
}

function showStory(all = false) {
  if (!pack || !sequence || !visible || document.hidden) return;
  const story = signatureStory(prefs.character);
  const steps = all ? Object.keys(pack.animations).map(action => ({action})) : storyTimeline(story, pack).steps;
  if (sequence.start(steps)) stage.dataset.story = all ? 'all' : story.id;
}

function playAction(action: string) {
  if (!pack?.animations[action] || !sequence || !visible || document.hidden) return;
  resetSequence(); sequence.start([{action}]);
}

function interact() {
  const actions: Record<Character, string[]> = {
    claude: ['happy', 'confused', 'reading', 'dance'],
    gpt: ['wave', 'idea', 'ready', 'happy'],
    deepseek: ['riceHappy', 'hungry', 'fast', 'happy'],
    clawd: ['Waving', 'JumpingHappy', 'Lightbulb', 'Confetti'],
  };
  const options = actions[prefs.character];
  playAction(options[interaction++ % options.length]);
}

function setVisible(next: boolean) {
  if (visible === next) return;
  visible = next; stage.hidden = !visible;
  closeMenu(); resetSequence();
  if (!visible) { player?.dispose(); player = undefined; }
  else makePlayer();
}

async function command(message: PetCommand) {
  if (!message || disposed) return;
  if (message.type === 'character' && characters.includes(message.value as Character)) await setCharacter(message.value as Character);
  else if (message.type === 'size' && typeof message.value === 'number') setView({size: message.value});
  else if (message.type === 'quality' && qualities.includes(message.value as Preferences['quality'])) setView({quality: message.value as Preferences['quality']});
  else if (message.type === 'action' && typeof message.value === 'string') message.value === 'all' ? showStory(true) : playAction(message.value);
  else if (message.type === 'showcase') showStory(message.value === 'all');
  else if (message.type === 'visible' && typeof message.value === 'boolean') setVisible(message.value);
}

function closeMenu() { menu.hidden = true; menu.replaceChildren(); }
function webMenu(x: number, y: number) {
  closeMenu();
  const section = (label: string) => { const title = document.createElement('small'); title.textContent = label; menu.append(title); };
  const item = (label: string, run: () => void, checked?: boolean) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.setAttribute('role', checked === undefined ? 'menuitem' : 'menuitemradio');
    if (checked !== undefined) button.setAttribute('aria-checked', String(checked));
    button.addEventListener('click', () => { closeMenu(); run(); }); menu.append(button);
  };
  section('角色'); for (const c of characters) item(names[c], () => void setCharacter(c), prefs.character === c);
  section('演出'); item('完整演出', () => showStory()); item('全部动作串烧', () => showStory(true));
  for (const [action, a] of Object.entries(pack?.animations ?? {})) item(a.title, () => playAction(action));
  section('大小'); for (const size of [80, 112, 160, 224]) item(size + ' px', () => setView({size}), prefs.size === size);
  section('清晰度' + (prefs.character === 'clawd' ? ' · Clawd 保留原始像素' : ''));
  for (const quality of qualities) item(quality === 'auto' ? '自动 · 随大小提高' : quality + ' px', () => setView({quality}), prefs.quality === quality);
  menu.hidden = false;
  menu.style.left = Math.max(6, Math.min(x, innerWidth - menu.offsetWidth - 6)) + 'px';
  menu.style.top = Math.max(6, Math.min(y, innerHeight - menu.offsetHeight - 6)) + 'px';
  menu.querySelector('button')?.focus();
}

stage.addEventListener('contextmenu', event => {
  event.preventDefault(); if (clickTimer !== undefined) clearTimeout(clickTimer);
  if (native) void call('open_pet_menu', {x: event.clientX, y: event.clientY}).catch(report);
  else webMenu(event.clientX, event.clientY);
});
actor.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  drag = {x: event.clientX, y: event.clientY, started: false};
});
document.addEventListener('pointermove', event => {
  if (!drag || drag.started || !(event.buttons & 1)) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
  drag.started = true; suppressClickUntil = performance.now() + 500;
  if (clickTimer !== undefined) clearTimeout(clickTimer);
  if (native) void call('start_dragging').catch(report);
});
document.addEventListener('pointerup', () => { if (drag?.started) suppressClickUntil = performance.now() + 250; drag = undefined; });
document.addEventListener('pointercancel', () => { drag = undefined; });
actor.addEventListener('click', event => {
  if (performance.now() < suppressClickUntil || event.detail > 1) return;
  closeMenu();
  if (clickTimer !== undefined) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => { clickTimer = undefined; interact(); }, 250);
});
actor.addEventListener('dblclick', event => {
  event.preventDefault(); if (performance.now() < suppressClickUntil) return;
  if (clickTimer !== undefined) clearTimeout(clickTimer); clickTimer = undefined; showStory();
});
document.addEventListener('pointerdown', event => { if (!menu.contains(event.target as Node)) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeMenu(); actor.focus(); }
  if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
    event.preventDefault(); const bounds = actor.getBoundingClientRect();
    if (native) void call('open_pet_menu', {x: bounds.x + bounds.width / 2, y: bounds.y}).catch(report);
    else webMenu(bounds.x, bounds.y);
  }
  if (!menu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); const buttons = [...menu.querySelectorAll('button')], current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetSequence(); closeMenu(); } });
addEventListener('resize', () => { player?.setView(prefs); });
let dpr = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
function pixelRatioChanged() { dpr.removeEventListener('change', pixelRatioChanged); player?.setView(prefs); dpr = matchMedia(`(resolution: ${devicePixelRatio}dppx)`); dpr.addEventListener('change', pixelRatioChanged); }
dpr.addEventListener('change', pixelRatioChanged);

addEventListener('pagehide', () => {
  disposed = true; ++loading; resetSequence(); player?.dispose(); unlisten?.(); drawing.disconnect(); captions.disconnect();
  dpr.removeEventListener('change', pixelRatioChanged);
  if (clickTimer !== undefined) clearTimeout(clickTimer);
  if (readinessRAF !== undefined) cancelAnimationFrame(readinessRAF);
}, {once: true});

async function start() {
  // Register before signalling readiness so a tray click cannot be lost during startup.
  unlisten = await commands(message => {
    if (!started) { if (startupCommands.length < 32) startupCommands.push(message); }
    else void command(message).catch(report);
  });
  const stored = await call<NativePreferences>('frontend_ready');
  if (stored) { prefs = preferences(stored); smoke = stored.smokeTest === true; visible = smoke || stored.visible !== false; }
  stage.hidden = !visible;
  fit(); await setCharacter(prefs.character);
  started = true;
  if (smoke) await smokeCheck();
  else for (const message of startupCommands.splice(0)) await command(message);
}

async function smokeCheck() {
  const checks: {character: Character; quality: string; resolution: number; action: string; drawnPixels: number}[] = [];
  for (const character of characters) {
    await setCharacter(character);
    for (const quality of qualities) {
      setView({quality});
      playAction(character === 'clawd' ? 'LookingAroundEyesOnly' : 'idle');
      const expected = petResolution(prefs, devicePixelRatio, character === 'clawd');
      const result = await new Promise<{action: string; drawnPixels: number}>((resolve, reject) => {
        const deadline = setTimeout(() => { observer.disconnect(); reject(Error(`No real ${character}/${quality} draw`)); }, 15000);
        const inspect = () => {
          if (canvas.dataset.character !== character || Number(canvas.dataset.resolution) !== expected) return;
          const a = pack?.animations[canvas.dataset.action ?? ''];
          if (!a || (!matchMedia('(prefers-reduced-motion: reduce)').matches && Number(canvas.dataset.frame) < Math.ceil(a.fps * .15))) return;
          const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
          let pixels = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) ++pixels;
          if (!pixels) return;
          clearTimeout(deadline); observer.disconnect(); resolve({action: canvas.dataset.action!, drawnPixels: pixels});
        };
        const observer = new MutationObserver(inspect);
        observer.observe(canvas, {attributes: true, attributeFilter: ['data-frame', 'data-action', 'data-resolution']});
        inspect();
      });
      checks.push({character, quality, resolution: expected, ...result});
    }
  }
  stage.dataset.ready = 'true';
  const last = checks.at(-1)!;
  await call('pet_drawn', {...last, width: canvas.width, height: canvas.height, checks});
}
void start().catch(error => { caption.dataset.error = 'true'; caption.textContent = '桌宠未能启动，请从托盘重新打开'; report(error); });
