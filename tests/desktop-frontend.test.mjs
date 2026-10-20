import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {build} from 'esbuild';

async function exportsOf(file) {
  const output = await build({entryPoints: [file], bundle: true, format: 'cjs', platform: 'browser', write: false});
  const sandbox = {module: {exports: {}}, URL, setTimeout, clearTimeout};
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(output.outputFiles[0].text, sandbox);
  return sandbox.module.exports;
}
const {Sequence} = await exportsOf('desktop/src/sequence.ts');
const {preferences, geometry, readPreferences, savePreferences} = await exportsOf('desktop/src/preferences.ts');
const {localAssets} = await exportsOf('desktop/src/assets.ts');
const {signatureStory, storyTimeline} = await exportsOf('src/stories.ts');
const {whenVisible} = await exportsOf('desktop/src/visibility.ts');
const sharedPlayer = (await build({entryPoints: ['src/player.ts'], bundle: true, format: 'cjs', platform: 'browser', write: false})).outputFiles[0].text;
const roles = ['claude', 'gpt', 'deepseek', 'clawd'];
const packs = Object.fromEntries(await Promise.all(roles.map(async role => [role, JSON.parse(await fs.readFile(`assets/${role}/manifest.json`, 'utf8'))])));

function clock() {
  let now = 0, id = 0;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { pending.set(++id, {at: now + ms, fn}); return id; },
    clearTimeout(timer) { pending.delete(timer); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...pending].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; pending.delete(next[0]); next[1].fn();
      }
      now = end;
    },
    get pending() { return pending.size; },
    get now() { return now; },
  };
}

test('desktop stories wait for an actual drawn clip and preserve every authored frame duration', () => {
  for (const role of roles) {
    const pack = packs[role], story = signatureStory(role), time = clock(), played = [];
    let completed = 0;
    const sequence = new Sequence(pack, action => played.push(action), () => ++completed, time);
    assert.equal(sequence.start(story.steps), true);
    const timeline = storyTimeline(story, pack);
    for (const step of timeline.steps) {
      assert.equal(played.at(-1), step.action);
      time.advance(2000); // Delayed first decode must not spend playback time.
      assert.equal(played.length, step.index + 1);
      sequence.drawn('unknown'); assert.equal(time.pending, 0);
      sequence.drawn(step.action); sequence.drawn(step.action); assert.equal(time.pending, 1);
      time.advance(step.frames / step.fps * 1000 - 1);
      assert.equal(played.length, step.index + 1, role + '/' + step.action + ' is not shortened to its sustain pose');
      time.advance(1);
    }
    assert.equal(completed, 1); assert.equal(sequence.running, false); assert.equal(time.pending, 0);
    assert.deepEqual(played, Array.from(story.steps, step => step.action));
    if (role === 'claude') assert.equal(timeline.frames, 195);
    if (role === 'clawd') assert.equal(played.length, 25);
  }
});

test('the actual shared Player and desktop sequencer paint every signature frame in order on one clock', async () => {
  for (const role of roles) {
    const time = clock(), images = [], painted = new Map(), listeners = new Map();
    const context = {setTransform() {}, clearRect() {}, drawImage() {}};
    const makeCanvas = () => ({width: 80, height: 80, style: {}, dataset: {}, getContext: () => context});
    const canvas = makeCanvas();
    canvas.dataset = new Proxy({}, {set(target, key, value) {
      target[key] = value;
      if (key === 'frame') {
        const frames = painted.get(target.action) ?? [];
        frames.push(Number(value)); painted.set(target.action, frames);
      }
      return true;
    }});
    const doc = {hidden: false, createElement: makeCanvas, addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k)};
    class Image {
      constructor() { images.push(this); }
      set src(value) { this.url = value; }
      decode() { return Promise.resolve(); }
    }
    const media = {matches: false, addEventListener() {}, removeEventListener() {}};
    const sandbox = {module: {exports: {}}, document: doc, Image, performance: {now: () => time.now}, matchMedia: () => media, devicePixelRatio: 1,
      setTimeout: (fn, ms) => time.setTimeout(fn, ms), clearTimeout: id => time.clearTimeout(id),
      requestAnimationFrame: fn => time.setTimeout(fn, 0), cancelAnimationFrame: id => time.clearTimeout(id)};
    sandbox.exports = sandbox.module.exports; vm.runInNewContext(sharedPlayer, sandbox);
    const pack = {...packs[role], urls: Object.fromEntries(Object.keys(packs[role].animations).map(a => [a, a]))};
    let sequence, completed = 0;
    const player = new sandbox.module.exports.Player(canvas, role, pack, {textContent: ''}, () => sequence?.drawn(canvas.dataset.action, true), async () => null, undefined,
      {frameLocked: true, onComplete: action => sequence?.completed(action)});
    sequence = new Sequence(pack, action => player.preview(action), () => ++completed, time);
    async function decode() {
      for (let i = 0; i < 6; i++) {
        for (const image of images) if (image.onload && image.url) { const fn = image.onload; image.onload = null; fn(); }
        await Promise.resolve();
      }
    }
    await decode();
    const story = signatureStory(role), timeline = storyTimeline(story, pack);
    sequence.start(story.steps); await decode();
    for (let ms = 0; ms < timeline.durationMs + 1000; ms += 10) { time.advance(10); await decode(); }
    assert.equal(completed, 1, role + ' completes exactly once');
    for (const step of timeline.steps) {
      const frames = [...new Set(painted.get(step.action))];
      assert.deepEqual(frames, Array.from({length: step.frames}, (_, i) => i), role + '/' + step.action + ' has every authored frame, including its last frame');
    }
    sequence.cancel(); player.dispose(); assert.equal(time.pending, 0); assert.equal(listeners.size, 0);
  }
});

test('cancelling a story cancels pending transitions and invalid actions cannot enter playback', () => {
  const time = clock(), played = [], sequence = new Sequence(packs.gpt, action => played.push(action), () => assert.fail('cancelled story completed'), time);
  sequence.start([{action: 'probe'}, {action: 'gate'}]); sequence.drawn('probe');
  assert.equal(time.pending, 1); sequence.cancel(); time.advance(90000);
  assert.deepEqual(played, ['probe']); assert.equal(time.pending, 0); assert.equal(sequence.step, undefined);
  assert.equal(sequence.start([{action: '../secret'}]), false); assert.equal(played.length, 1);
  sequence.start([{action: 'wave'}]); sequence.drawn('probe'); assert.equal(time.pending, 0);
  sequence.cancel();
});

test('all 66 standalone clips resolve to bundled local image files with no data URI copies', async () => {
  const requests = [], base = new URL('http://tauri.localhost/baobaolong-assets/');
  const assets = localAssets(base, async url => {
    requests.push(String(url));
    const role = /assets\/(\w+)\/manifest.json$/.exec(String(url))?.[1];
    return {ok: true, json: async () => packs[role]};
  });
  let total = 0;
  for (const role of roles) {
    const pack = await assets.pack(role); await assets.pack(role);
    for (const [action, url] of Object.entries(pack.urls)) {
      assert.equal(new URL(url).origin, base.origin);
      assert.equal(new URL(url).pathname, `/baobaolong-assets/assets/${role}/${pack.animations[action].file}`);
      await fs.access(`assets/${role}/${pack.animations[action].file}`); ++total;
    }
  }
  assert.equal(total, 66); assert.equal(requests.length, 4);
  assert.equal(assets.hdURL('claude', 'special', 'claude/special/320-0.png'), base.href + 'assets-hd/claude/special/320-0.png');
  for (const file of ['../secret.png', 'claude/special/../secret.png', 'claude/special/999-0.png', 'https://remote.invalid/image.png']) assert.equal(assets.hdURL('claude', 'special', file), null);
});

test('failed metadata requests retry and invalid atlas paths never become image URLs', async () => {
  let requests = 0;
  const assets = localAssets(new URL('http://tauri.localhost/baobaolong-assets/'), async () => {
    if (++requests === 1) return {ok: false};
    return {ok: true, json: async () => ({animations: {idle: {...packs.claude.animations.idle, file: '../outside.png'}}})};
  });
  await assert.rejects(assets.pack('claude'), /unavailable/);
  await assert.rejects(assets.pack('claude'), /metadata/);
  assert.equal(requests, 2);
});

test('size reserves wide props and upper captions while preferences tolerate blocked storage', () => {
  assert.equal(preferences({character: 'unknown', size: 900, quality: 'fake'}).size, 224);
  assert.equal(preferences({character: 'unknown'}).character, 'claude');
  assert.equal(preferences({size: -5, quality: '320'}).size, 80);
  assert.equal(readPreferences({getItem() { throw Error('blocked'); }}).quality, 'auto');
  assert.doesNotThrow(() => savePreferences({setItem() { throw Error('full'); }}, preferences(null)));
  for (const size of [80, 112, 160, 224]) {
    const bounds = geometry(size);
    assert.ok(bounds.width >= size * 128 / 80 + 16);
    assert.equal(bounds.baseline, 42 + size * 67 / 80);
    assert.ok(bounds.height > 42 + size);
  }
});

function visibilityHarness(hidden = true) {
  let id = 0;
  const listeners = new Set(), frames = new Map();
  const doc = {hidden, addEventListener(_name, fn) { listeners.add(fn); }, removeEventListener(_name, fn) { listeners.delete(fn); }};
  return {doc, listeners, frames,
    frame(fn) { frames.set(++id, fn); return id; }, cancel(id) { frames.delete(id); },
    visibility(value) { doc.hidden = value; for (const fn of listeners) fn(); },
    paint() { for (const [id, fn] of [...frames]) { frames.delete(id); fn(0); } },
  };
}

test('native show visibility settles before playback, including a late duplicate visibility event', async () => {
  const h = visibilityHarness(), pending = whenVisible(h);
  let ready = false; void pending.then(() => { ready = true; });
  assert.equal(h.frames.size, 0);
  h.doc.hidden = false; assert.equal(h.frames.size, 0, 'a property change alone has not delivered the event');
  h.visibility(false); h.paint(); await Promise.resolve(); assert.equal(ready, false);
  h.visibility(false); // A queued native event restarts the two-frame quiet period.
  h.paint(); await Promise.resolve(); assert.equal(ready, false);
  h.paint(); await pending; assert.equal(ready, true); assert.equal(h.listeners.size, 0); assert.equal(h.frames.size, 0);
});

test('hiding or aborting a native show cancels pending rendering work without resolving visibility', async () => {
  const h = visibilityHarness(false), controller = new AbortController();
  const pending = whenVisible({...h, signal: controller.signal});
  h.paint(); h.visibility(true); assert.equal(h.frames.size, 0);
  controller.abort(); await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(h.listeners.size, 0); assert.equal(h.frames.size, 0);
  const blocked = visibilityHarness(true);
  await assert.rejects(whenVisible({...blocked, timeout: 1}), /did not become visible/);
  assert.equal(blocked.listeners.size, 0);
});
