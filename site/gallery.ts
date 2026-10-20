import {captionAt, names, type Animation, type Character, type Pack} from '../src/policy';
import {readViewSettings, stagePlacement, resolveQuality, type Quality, type SourceQuality} from './view-settings';
import data from '../.generated/site-packs.json';

type Clip = {duration: number; fps: number; width: number; height: number; sources: Partial<Record<'360' | '720', string>>};
type MediaManifest = {characters: Partial<Record<Character, Record<string, Clip>>>};
const packs = data as Record<Character, Pack>;
const ids = Object.keys(packs) as Character[];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const query = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const group = query<HTMLCanvasElement>('#group'), solo = query<HTMLCanvasElement>('#solo');
const context = solo.getContext('2d')!, groupContext = group.getContext('2d')!;
const stage = query<HTMLDivElement>('.stage');
const actionSelect = query<HTMLSelectElement>('#action'), timeline = query<HTMLInputElement>('#timeline');
const caption = query('#caption'), playButton = query<HTMLButtonElement>('#play'), counter = query<HTMLOutputElement>('#counter');
const info = query('#clip-info'), loop = query<HTMLInputElement>('#loop');
const quality = query<HTMLSelectElement>('#quality'), sizeInput = query<HTMLInputElement>('#pet-size');
const sizeOutput = query<HTMLOutputElement>('#size-value'), qualityNote = query('#quality-note');
let saved: string | null = null;
try { saved = localStorage.getItem('pixel-pets-view'); } catch { /* Private browsing can deny storage. */ }
const view = readViewSettings(location.search, saved);
quality.value = view.quality;
sizeInput.value = String(view.size);
let character: Character = 'claude', action = 'special', image: HTMLImageElement | null = null;
let current: Animation | undefined, clip: Clip | undefined, video: HTMLVideoElement | null = null;
let elapsed = 0, started = 0, playing = !reduced.matches, revision = 0, raf: number | undefined;
let soloVisible = false, groupVisible = false, signature = '', groupSignature = '';
let pendingVideo: HTMLVideoElement | null = null, mediaError = false, pixelRunning = false;
let activeQuality: SourceQuality = 'pixel', requestedQuality: SourceQuality | null = null, selecting = false;
const cancelVideoLoad = new WeakMap<HTMLVideoElement, () => void>();
const cache = new Map<string, Promise<HTMLImageElement>>();
const groupImages = new Map<Character, HTMLImageElement>();
const heroPosters = new Map<Character, HTMLImageElement>();
const manifest = fetch('media/manifest.json').then(async response => {
  if (!response.ok) throw Error('HD manifest unavailable');
  return await response.json() as MediaManifest;
}).catch(() => ({characters: {}} as MediaManifest));

function saveView() {
  try { localStorage.setItem('pixel-pets-view', JSON.stringify(view)); } catch { /* Optional preference. */ }
}
function disposeVideo(element: HTMLVideoElement | null) {
  if (!element) return;
  cancelVideoLoad.get(element)?.();
  element.pause(); element.removeAttribute('src'); element.load(); element.remove();
}
function stopPending() { disposeVideo(pendingVideo); pendingVideo = null; }
async function load(c: Character, a: string) {
  const key = c + '/' + a;
  let hit = cache.get(key);
  if (!hit) {
    const img = new Image(); img.decoding = 'async';
    hit = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => img.decode().then(() => resolve(img), reject);
      img.onerror = () => reject(Error('Pixel atlas unavailable'));
      img.src = packs[c].urls[a];
    });
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
    while (cache.size > 6) cache.delete(cache.keys().next().value!);
  }
  return hit;
}
function blit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, a: Animation, n: number, x: number, y: number, scale: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, n % a.columns * a.width, Math.floor(n / a.columns) * a.height, a.width, a.height,
    Math.round(x - a.width * scale / 2), Math.round(y), a.width * scale, a.height * scale);
}
function duration() { return video && clip ? clip.duration : current ? current.frames / current.fps : 0; }
function rate() { return video && clip ? clip.fps : current?.fps ?? 20; }
function seconds(now = performance.now()) {
  return video ? video.currentTime : Math.min(duration(), elapsed + (playing && pixelRunning ? (now - started) / 1000 : 0));
}
function updatePlayButton() {
  playButton.textContent = playing ? 'Ⅱ' : '▶';
  playButton.setAttribute('aria-label', playing ? '暂停动画' : '播放动画');
}
function updateInfo() {
  if (!current) return;
  const total = Math.max(1, Math.round(duration() * rate()));
  timeline.max = String(total - 1);
  info.textContent = `${current.title} · ${total} 帧 · ${rate()} fps · ${duration().toFixed(2)}s`;
  query('#stage-label').textContent = video ? `${view.quality === 'auto' ? 'AUTO · ' : ''}${activeQuality}p ORIGINAL PREVIEW` : 'ORIGINAL PIXEL PREVIEW';
}
function note(loading = false) {
  qualityNote.classList.toggle('is-loading', loading);
  if (character === 'clawd') qualityNote.textContent = 'Clawd 使用原版像素素材，保留原始颗粒；显示大小仍可调。';
  else if (loading) qualityNote.textContent = '正在载入清晰原片，保留当前画面……';
  else if (mediaError) qualityNote.textContent = '高清素材暂时无法载入，已保留当前可播放版本；可重新选择清晰度重试。';
  else qualityNote.textContent = video ? `${view.quality === 'auto' ? '自动 · ' : ''}${activeQuality}p 清晰原片 · ${view.quality === 'auto' ? '放大时自动提升清晰度。' : '已固定清晰度；显示大小独立可调。'}` : '80px 桌面像素版 · 完整动作与帧序，适合预览实际小宠物大小。';
}
function wantedQuality() {
  const p = stagePlacement(view.size, stage.clientWidth, (current?.width ?? 80) / (current?.height ?? 80));
  return resolveQuality(view.quality, p.actor, devicePixelRatio || 1, character === 'clawd');
}
function autoQuality() { if (!selecting && current && view.quality === 'auto' && wantedQuality() !== requestedQuality) void switchQuality(); }
function layout() {
  const p = stagePlacement(view.size, stage.clientWidth, (current?.width ?? 80) / (current?.height ?? 80));
  stage.style.height = p.height + 'px';
  stage.style.setProperty('--video-size', p.videoSize + 'px');
  stage.style.setProperty('--video-width', p.videoWidth + 'px');
  stage.style.setProperty('--video-top', p.videoTop + 'px');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(stage.clientWidth * dpr), height = Math.round(p.height * dpr);
  if (solo.width !== width || solo.height !== height) { solo.width = width; solo.height = height; }
  sizeOutput.value = `${view.size}px`;
  sizeInput.setAttribute('aria-valuetext', `${view.size} 像素${p.actor < view.size ? '，在当前屏幕内适配' : ''}`);
  signature = ''; drawSolo();
}
function drawSolo() {
  if (!image || !current) return;
  const time = seconds();
  const n = Math.min(Math.max(0, Math.round(duration() * rate()) - 1), Math.floor(time * rate()));
  const next = `${revision}:${n}:${solo.width}:${view.size}:${!!video}`;
  if (next === signature) return;
  signature = next;
  if (!video) {
    context.clearRect(0, 0, solo.width, solo.height);
    const p = stagePlacement(view.size, stage.clientWidth, (current?.width ?? 80) / (current?.height ?? 80)), dpr = Math.min(devicePixelRatio || 1, 2);
    blit(context, image, current, Math.min(current.frames - 1, n), solo.width / 2,
      (p.baseline - 67 * p.actor / 54) * dpr, p.actor / 54 * dpr);
  }
  timeline.value = String(n);
  counter.value = String(n + 1).padStart(3, '0') + ' / ' + Math.max(1, Math.round(duration() * rate()));
  caption.textContent = captionAt(character, action, Math.min(time, Math.max(0, duration() - 1 / rate())) * 1000, current);
}
function schedule() { if (raf === undefined && !document.hidden && ((soloVisible && playing) || (groupVisible && !reduced.matches))) raf = requestAnimationFrame(clock); }
function clock(now: number) {
  if (raf !== undefined) cancelAnimationFrame(raf);
  raf = undefined;
  if (document.hidden) return;
  if (soloVisible && playing && current) {
    if (!video && seconds(now) >= duration()) {
      if (loop.checked) { elapsed = 0; started = now; } else { elapsed = duration(); playing = false; updatePlayButton(); }
    }
    drawSolo();
  }
  if (groupVisible) {
    const next = ids.map(c => {
      const a = packs[c].animations[c === 'clawd' ? 'LookingAroundEyesOnly' : 'idle'];
      return heroPosters.has(c) ? -2 : groupImages.has(c) ? reduced.matches ? a.poster : Math.floor(now / 1000 * a.fps) % a.frames : -1;
    });
    const nextSignature = next.join(',');
    if (nextSignature !== groupSignature) {
      groupSignature = nextSignature; groupContext.clearRect(0, 0, group.width, group.height);
      for (let i = 0; i < ids.length; i++) {
        const c = ids[i], a = packs[c].animations[c === 'clawd' ? 'LookingAroundEyesOnly' : 'idle'], img = groupImages.get(c);
        const poster = heroPosters.get(c);
        if (poster) {
          groupContext.imageSmoothingEnabled = true; groupContext.imageSmoothingQuality = 'high';
          const width = 240 * poster.naturalWidth / poster.naturalHeight;
          groupContext.drawImage(poster, 140 + i * 280 - width / 2, 55, width, 240);
        } else if (img) blit(groupContext, img, a, next[i], 140 + i * 280, 55, 3);
      }
    }
  }
  schedule();
}
function syncVisibility() {
  if (document.hidden || !soloVisible) {
    if (!video && playing && pixelRunning) elapsed = Math.min(duration(), elapsed + (performance.now() - started) / 1000);
    pixelRunning = false;
    video?.pause();
    if (raf !== undefined) cancelAnimationFrame(raf); raf = undefined;
  } else {
    started = performance.now(); pixelRunning = true;
    if (video && playing) { const live = video; void live.play().catch(() => { if (video === live) { playing = false; updatePlayButton(); } }); }
  }
  drawSolo(); schedule();
}
function pauseOrPlay(next: boolean) {
  if (!current) return;
  elapsed = seconds();
  if (next && elapsed >= duration() - .02) { elapsed = 0; if (video) video.currentTime = 0; }
  playing = next; started = performance.now(); pixelRunning = soloVisible && !document.hidden;
  updatePlayButton();
  if (video) {
    if (next && soloVisible && !document.hidden) { const live = video; void live.play().catch(() => { if (video === live) { playing = false; updatePlayButton(); } }); }
    else video.pause();
  }
  drawSolo(); schedule();
}
function pixelMode(time: number) {
  disposeVideo(video); video = null; activeQuality = 'pixel'; elapsed = time; started = performance.now(); solo.hidden = false;
  pixelRunning = soloVisible && !document.hidden; signature = ''; updateInfo(); drawSolo(); note(); schedule();
}
function videoReady(element: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(Error('Video loading timed out')), 20000);
    const finish = (error?: Error) => {
      clearTimeout(timer); cancelVideoLoad.delete(element); element.removeEventListener('error', failure); element.removeEventListener('loadeddata', loaded); element.removeEventListener('seeked', seeked);
      error ? reject(error) : resolve();
    };
    const failure = () => finish(Error('Video loading failed'));
    const seeked = () => finish();
    const loaded = () => {
      const target = Math.max(0, Math.min(time, element.duration - .001));
      if (target > .001) { element.addEventListener('seeked', seeked, {once: true}); element.currentTime = target; }
      else finish();
    };
    cancelVideoLoad.set(element, () => finish(Error('Video loading cancelled')));
    element.addEventListener('error', failure, {once: true});
    element.addEventListener('loadeddata', loaded, {once: true});
    element.load();
  });
}
function seekReady(element: HTMLVideoElement, time: number) {
  const target = Math.max(0, Math.min(time, element.duration - .001));
  if (Math.abs(element.currentTime - target) <= .04 && !element.seeking) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(Error('Video seek timed out')), 8000);
    const finish = (error?: Error) => {
      clearTimeout(timer); cancelVideoLoad.delete(element);
      element.removeEventListener('seeked', seeked); element.removeEventListener('error', failure);
      error ? reject(error) : resolve();
    };
    const seeked = () => finish();
    const failure = () => finish(Error('Video seek failed'));
    cancelVideoLoad.set(element, () => finish(Error('Video seek cancelled')));
    element.addEventListener('seeked', seeked, {once: true}); element.addEventListener('error', failure, {once: true});
    element.currentTime = target;
  });
}
async function switchQuality() {
  if (!current || selecting) return;
  const rev = ++revision;
  stopPending();
  const time = seconds();
  mediaError = false;
  quality.disabled = character === 'clawd'; quality.value = character === 'clawd' ? 'pixel' : view.quality;
  const targetQuality = wantedQuality(); requestedQuality = targetQuality;
  if (targetQuality === 'pixel') { pixelMode(time); return; }
  note(true);
  const media = await manifest;
  if (rev !== revision) return;
  const nextClip = media.characters[character]?.[action];
  const url = nextClip?.sources[targetQuality as '360' | '720'];
  if (!nextClip || !url) { mediaError = true; if (!video) pixelMode(time); note(); return; }
  const candidate = document.createElement('video');
  candidate.className = 'hd-clip'; candidate.muted = true; candidate.playsInline = true; candidate.preload = 'auto';
  candidate.setAttribute('aria-hidden', 'true'); candidate.src = url; candidate.loop = loop.checked;
  pendingVideo = candidate;
  try {
    await videoReady(candidate, time);
    if (rev !== revision) { disposeVideo(candidate); return; }
    await seekReady(candidate, seconds());
    if (rev !== revision) { disposeVideo(candidate); return; }
    candidate.loop = loop.checked;
    disposeVideo(video); video = candidate; pendingVideo = null; clip = nextClip; activeQuality = targetQuality;
    stage.insertBefore(candidate, solo); solo.hidden = true;
    candidate.addEventListener('ended', () => { if (video !== candidate) return; playing = false; elapsed = nextClip.duration; updatePlayButton(); signature = ''; drawSolo(); });
    candidate.addEventListener('error', () => { if (video !== candidate) return; const last = candidate.currentTime; mediaError = true; pixelMode(last); });
    elapsed = candidate.currentTime; started = performance.now();
    signature = ''; updateInfo(); note(); drawSolo();
    if (playing && soloVisible && !document.hidden) await candidate.play().catch(() => { if (video === candidate && rev === revision) { playing = false; updatePlayButton(); } });
    schedule();
  } catch {
    if (rev !== revision) return;
    disposeVideo(candidate); pendingVideo = null; mediaError = true;
    if (!video) pixelMode(seconds());
    note();
  }
}
async function select(c: Character, a: string) {
  const rev = ++revision; selecting = true;
  stopPending(); note(true); stage.setAttribute('aria-busy', 'true');
  try {
    const nextImage = await load(c, a);
    if (rev !== revision) return;
    disposeVideo(video); video = null;
    character = c; action = a; current = packs[c].animations[a]; image = nextImage; clip = undefined; activeQuality = 'pixel'; requestedQuality = null;
    elapsed = 0; started = performance.now(); playing = !reduced.matches; pixelRunning = soloVisible && !document.hidden;
    actionSelect.replaceChildren(...Object.entries(packs[c].animations).map(([id, a]) => {
      const option = document.createElement('option'); option.value = id; option.textContent = a.title; return option;
    }));
    actionSelect.value = a; stage.setAttribute('aria-labelledby', 'role-' + c);
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-character]')) {
      const selected = button.dataset.character === c; button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    }
    solo.hidden = false; signature = ''; updateInfo(); updatePlayButton(); layout();
    stage.removeAttribute('aria-busy'); selecting = false;
    await switchQuality();
  } catch {
    if (rev !== revision) return;
    stage.removeAttribute('aria-busy'); selecting = false; qualityNote.textContent = '素材暂时无法载入，请重新选择动作。';
  }
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-character]')) button.addEventListener('click', () => {
  const c = button.dataset.character as Character;
  void select(c, ({claude: 'special', gpt: 'probe', deepseek: 'steal', clawd: 'BreakDancing'} as const)[c]);
});
const roleButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-character]')];
for (const button of roleButtons) {
  button.id = 'role-' + button.dataset.character; button.setAttribute('aria-controls', 'pet-stage');
  button.addEventListener('keydown', event => {
    const index = roleButtons.indexOf(button);
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? roleButtons.length - 1 : event.key === 'ArrowRight' ? (index + 1) % roleButtons.length : event.key === 'ArrowLeft' ? (index + roleButtons.length - 1) % roleButtons.length : -1;
    if (target < 0) return;
    event.preventDefault(); roleButtons[target].focus(); roleButtons[target].click();
  });
}
actionSelect.addEventListener('change', () => void select(character, actionSelect.value));
quality.addEventListener('change', () => { view.quality = quality.value as Quality; saveView(); void switchQuality(); });
sizeInput.addEventListener('input', () => { view.size = Number(sizeInput.value); saveView(); layout(); autoQuality(); });
playButton.addEventListener('click', () => pauseOrPlay(!playing));
query('#replay').addEventListener('click', () => { elapsed = 0; if (video) video.currentTime = 0; started = performance.now(); pauseOrPlay(true); signature = ''; drawSolo(); });
timeline.addEventListener('input', () => { elapsed = Number(timeline.value) / rate(); started = performance.now(); if (video) video.currentTime = elapsed; signature = ''; drawSolo(); });
loop.addEventListener('change', () => { if (video) video.loop = loop.checked; });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-state]')) button.addEventListener('click', () => {
  const map = {claude: {thinking: 'thinking', tools: 'typing', waiting: 'pointing', done: 'happy'}, gpt: {thinking: 'thinking', tools: 'probe', waiting: 'gate', done: 'ready'}, deepseek: {thinking: 'chain', tools: 'typing', waiting: 'hungry', done: 'riceHappy'}, clawd: {thinking: 'Thinking', tools: 'Laptop', waiting: 'Pointing', done: 'Confetti'}};
  void select(character, map[character][button.dataset.state as 'thinking']);
});
function loadHeroFallback(c: Character) {
  void load(c, c === 'clawd' ? 'LookingAroundEyesOnly' : 'idle').then(img => {
    groupImages.set(c, img); groupSignature = ''; clock(performance.now());
  }).catch(() => {});
}
for (const c of ids.filter(c => c !== 'clawd')) {
  const poster = new Image(); poster.decoding = 'async';
  poster.onload = () => void poster.decode().then(() => {
    heroPosters.set(c, poster); groupSignature = ''; clock(performance.now());
  }).catch(() => loadHeroFallback(c));
  poster.onerror = () => loadHeroFallback(c);
  poster.src = `media/posters/${c}.png`;
}
loadHeroFallback('clawd');
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.target === stage) { const oldVisible = soloVisible; soloVisible = entry.isIntersecting; if (oldVisible !== soloVisible) syncVisibility(); }
    else groupVisible = entry.isIntersecting;
  }
  if (groupVisible) clock(performance.now());
}, {threshold: .05});
observer.observe(group); observer.observe(stage);
new ResizeObserver(() => { layout(); autoQuality(); }).observe(stage);
window.addEventListener('resize', autoQuality);
document.addEventListener('visibilitychange', syncVisibility);
reduced.addEventListener('change', () => { pauseOrPlay(!reduced.matches); groupSignature = ''; clock(performance.now()); });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-target]')) {
  const label = button.getAttribute('aria-label') ?? '复制安装命令';
  let reset: number | undefined;
  button.addEventListener('click', async () => {
    const command = document.getElementById(button.dataset.copyTarget ?? '')?.textContent?.trim();
    if (!command) return;
    clearTimeout(reset);
    try { await navigator.clipboard.writeText(command); button.textContent = '已复制'; button.setAttribute('aria-label', label + '，已复制'); }
    catch { button.textContent = '请选中复制'; button.setAttribute('aria-label', label + '，请手动选择命令复制'); }
    reset = window.setTimeout(() => { button.textContent = '复制'; button.setAttribute('aria-label', label); }, 1800);
  });
}
for (const c of ids) {
  const link = document.createElement('a'); link.textContent = names[c] + ' · 兼容图集 ↗';
  link.href = 'codex://pets/install?' + new URLSearchParams({name: names[c], imageUrl: 'https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/codex/' + c + '/spritesheet.png', spriteVersionNumber: '1'});
  query('#native-links').append(link);
}
void select('claude', 'special');
