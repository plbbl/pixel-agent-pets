#!/usr/bin/env python3
"""Render the README visuals from the real animation sources.

Everything is composed at final resolution with nearest-neighbour scaling only:
HD characters come from assets-hd (320/160 px), Clawd from its 80 px atlas at an
integer scale, and all text uses the 12 px Fusion Pixel bitmap font (SIL OFL).
Backgrounds are transparent; text only appears inside outlined bubbles and pills,
so every image reads on both GitHub themes.

    python3 scripts/build-readme-media.py [hero work wall stories buttons cover]
"""
import io
import json
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'media')
FONT = os.environ.get('PIXEL_FONT') or os.path.join(ROOT, 'work', 'fonts', 'fusion-pixel-12px-proportional-zh_hans.ms.bitmap.ttf')
FONT_ZIP = 'https://github.com/TakWolf/fusion-pixel-font/releases/download/2026.10.16/fusion-pixel-font-12px-proportional-ms.bitmap.ttf-v2026.10.16.zip'

INK = (16, 17, 30)
WHITE = (250, 247, 240)
YELLOW = (255, 210, 64)
YELLOW_EDGE = (176, 128, 20)
ACCENT = {'claude': (240, 128, 64), 'gpt': (226, 226, 230), 'deepseek': (72, 146, 255), 'clawd': (217, 119, 87)}
NAMES = {'claude': 'Claude', 'gpt': 'GPT', 'deepseek': 'DeepSeek', 'clawd': 'Clawd'}
CHARACTERS = ['claude', 'gpt', 'deepseek', 'clawd']

_hd = json.load(open(os.path.join(ROOT, 'assets-hd', 'manifest.json')))
_packs = {c: json.load(open(os.path.join(ROOT, 'assets', c, 'manifest.json'))) for c in CHARACTERS}


# ---------------------------------------------------------------- sources

def _near(x, y, tol=30):
    return (x[..., 3] == y[..., 3]) & (np.abs(x[..., :3] - y[..., :3]).sum(-1) <= tol)


def _specks(mask, art):
    """Pixels of `mask` with at most two art pixels' worth of company in a 3x3 art-pixel window."""
    k = 3 * art
    r = k // 2
    m = np.pad(mask.astype(np.int32), ((r, k - 1 - r), (r, k - 1 - r)))
    c = np.zeros((m.shape[0] + 1, m.shape[1] + 1), np.int32)
    c[1:, 1:] = m.cumsum(0).cumsum(1)
    count = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return mask & (count <= 2 * art * art)


def steady(frames, art):
    """Remove the shimmer the video-to-pixel conversion left in the clips.

    `art` is the screen size of one art pixel. Three passes per frame, each one
    restoring the previous frame's pixel:
    - a one-frame blip whose neighbours agree exactly;
    - colour jitter, a pixel that moved by only a few levels;
    - an isolated speck that leaves and comes back within three frames.
    Real motion (an eye blink, a prop) changes a connected area and is kept.
    """
    out = np.stack([np.asarray(f) for f in frames]).astype(np.int16)
    n = len(out)
    for i in range(1, n):
        prev, cur = out[i - 1], out[i]
        if i + 1 < n:
            blip = (prev == out[i + 1]).all(-1) & (cur != prev).any(-1)
            cur[blip] = prev[blip]
        jitter = _near(cur, prev) & (cur != prev).any(-1)
        cur[jitter] = prev[jitter]
        for span in (1, 2, 3):
            if i + span >= n:
                break
            moved = np.zeros(prev.shape[:2], bool)
            for k in range(span):
                moved |= ~_near(out[i + k], prev)
            speck = _specks(_near(prev, out[i + span]) & moved, art)
            for k in range(span):
                out[i + k][speck] = prev[speck]
    return tuple(Image.fromarray(f.astype(np.uint8)) for f in out)


@lru_cache(maxsize=None)
def clip(character, action, size=320, pixel=False):
    """All frames of one authored clip at `size` px, plus its fps.

    HD characters read their true 160/320 px sources; `pixel` (and Clawd always)
    reads the 80 px atlas at an integer scale instead.
    """
    if character != 'clawd' and not pixel:
        v = _hd['characters'][character]['animations'][action][str(size)]
        frames = []
        for i, name in enumerate(v['files']):
            sheet = Image.open(os.path.join(ROOT, 'assets-hd', name)).convert('RGBA')
            for k in range(min(v['chunkFrames'], v['frames'] - i * v['chunkFrames'])):
                x, y = k % v['columns'] * v['width'], k // v['columns'] * v['height']
                frames.append(sheet.crop((x, y, x + v['width'], y + v['height'])))
        return steady(frames, size // 80), v['fps']
    a = _packs[character]['animations'][action]
    sheet = Image.open(os.path.join(ROOT, 'assets', character, a['file'])).convert('RGBA')
    scale = size // a['height']
    frames = []
    for n in range(a['frames']):
        x, y = n % a['columns'] * a['width'], n // a['columns'] * a['height']
        frames.append(sheet.crop((x, y, x + a['width'], y + a['height'])).resize((a['width'] * scale, a['height'] * scale), Image.NEAREST))
    return steady(frames, scale), a['fps']


def frame_at(character, action, t, size=320, pixel=False):
    frames, fps = clip(character, action, size, pixel)
    return frames[int(t * fps + 1e-6) % len(frames)]


def place(img, f, cx, feet, character, size):
    """Composite frame `f` centred on cx with the character's feet on y=feet."""
    sole = 67 * (size // 80) if character == 'clawd' else size * 268 // 320
    img.alpha_composite(f, (cx - f.width // 2, feet - sole))


def phase(character, action, k=0):
    """Start offset for a looping clip: its poster frame, else a stagger, so a grid never opens on identical poses."""
    a = _packs[character]['animations'][action]
    poster = a.get('poster', 0)
    return poster / a['fps'] if poster else (k * 0.37) % (a['frames'] / a['fps'])


def actions(character):
    return list(_packs[character]['animations'])


# ---------------------------------------------------------------- pixel text

@lru_cache(maxsize=None)
def _font():
    if not os.path.exists(FONT):
        os.makedirs(os.path.dirname(FONT), exist_ok=True)
        with urllib.request.urlopen(FONT_ZIP) as r, zipfile.ZipFile(io.BytesIO(r.read())) as z:
            open(FONT, 'wb').write(z.read(os.path.basename(FONT)))
    return ImageFont.truetype(FONT, 12)


@lru_cache(maxsize=None)
def glyphs(text):
    """1-bit mask of `text` at the font's native 12 px."""
    f = _font()
    w = max(1, f.getbbox(text)[2])
    im = Image.new('L', (w + 1, 13), 0)
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    d.text((0, -1), text, font=f, fill=255)
    return im.crop((0, 0, w, 13))


def text_size(text, scale):
    m = glyphs(text)
    return m.width * scale, m.height * scale


def draw_text(img, xy, text, scale, color, outline=None, anchor='l'):
    """Pixel text; `outline` draws a one-text-pixel rim so it reads on any background."""
    m = glyphs(text)
    w, h = m.width * scale, m.height * scale
    x, y = xy
    x -= {'l': 0, 'c': w // 2, 'r': w}[anchor]
    big = m.resize((w, h), Image.NEAREST)
    if outline:
        rim = Image.new('RGBA', (w, h), outline + (255,))
        for dx in (-scale, 0, scale):
            for dy in (-scale, 0, scale):
                if dx or dy:
                    img.paste(rim, (x + dx, y + dy), big)
    img.paste(Image.new('RGBA', (w, h), color + (255,)), (x, y), big)
    return w, h


# ---------------------------------------------------------------- pixel shapes

def pixel_rect(img, box, fill, s, radius=2, border=None):
    """Rectangle with stepped pixel corners on an s-pixel grid; `border` adds a one-unit rim."""
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)

    def body(col, inset):
        for r in range(radius):
            k = radius - r
            d.rectangle((x0 + (k + inset) * s, y0 + (r + inset) * s, x1 - (k + inset) * s - 1, y0 + (r + inset + 1) * s - 1), col)
            d.rectangle((x0 + (k + inset) * s, y1 - (r + inset + 1) * s, x1 - (k + inset) * s - 1, y1 - (r + inset) * s - 1), col)
        d.rectangle((x0 + inset * s, y0 + (radius + inset) * s, x1 - inset * s - 1, y1 - (radius + inset) * s - 1), col)

    if border:
        body(border, 0)
        body(fill, 1)
    else:
        body(fill, 0)


def pill(img, cx, top, text, s, fill, ink=INK, scale=None, pad=(5, 2)):
    """Outlined label; returns its box."""
    scale = scale or s
    tw, th = text_size(text, scale)
    w, h = tw + 2 * pad[0] * s + 2 * s, th + 2 * pad[1] * s + 2 * s
    x0 = cx - w // 2
    pixel_rect(img, (x0, top, x0 + w, top + h), fill, s, radius=2, border=INK)
    draw_text(img, (cx, top + s + pad[1] * s + s // 2), text, scale, ink, anchor='c')
    return x0, top, x0 + w, top + h


def bubble(img, cx, bottom, text, s):
    """White speech bubble with an ink rim and a tail pointing down at x=cx; its tail tip sits on `bottom`."""
    tw, th = text_size(text, s)
    w, h = tw + 12 * s, th + 8 * s
    x0, y0 = cx - w // 2, bottom - h - 4 * s
    d = ImageDraw.Draw(img)
    for i in range(4):  # tail rim, then fill
        d.rectangle((cx - (3 - i) * s, y0 + h - s + i * s, cx + 2 * s - 1, y0 + h + i * s - 1), INK)
    pixel_rect(img, (x0, y0, x0 + w, y0 + h), WHITE, s, radius=2, border=INK)
    for i in range(3):
        d.rectangle((cx - (2 - i) * s, y0 + h - s + i * s, cx + s - 1, y0 + h + i * s - 1), WHITE)
    draw_text(img, (cx, y0 + 4 * s), text, s, INK, anchor='c')


def pixel_logo(px=24, scale=4):
    logo = Image.open(os.path.join(ROOT, 'docs', 'media', 'baobaolong.png')).convert('RGB')
    small = logo.resize((px, px), Image.LANCZOS).quantize(colors=8, dither=Image.Dither.NONE).convert('RGBA')
    big = small.resize((px * scale, px * scale), Image.NEAREST)
    mask = Image.new('L', big.size, 0)
    pixel_rect(mask, (0, 0, big.width, big.height), 255, scale, radius=2)
    out = Image.new('RGBA', big.size, (0, 0, 0, 0))
    out.paste(big, (0, 0), mask)
    return out


def canvas(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


# ---------------------------------------------------------------- output

def save_anim(frames, name, ms):
    """Animated GIF with one global palette and 1-bit transparency.

    The art is hard-edged pixel work with binary alpha, so GIF loses nothing, and a
    single palette shared by every frame keeps colours from shifting between frames.
    gifsicle, when installed, shrinks the file losslessly; the result is decoded
    again and must match the drawn frames pixel for pixel.
    """
    path = os.path.join(OUT, name)
    durations = list(ms) if isinstance(ms, list) else [ms] * len(frames)
    sample = frames[:: max(1, len(frames) // 24)] + [frames[-1]]
    opaque = np.concatenate([np.asarray(f)[..., :3][np.asarray(f)[..., 3] > 0] for f in sample])
    colours = np.unique(opaque, axis=0)
    if len(colours) <= 255:
        lut = colours
    else:
        strip = Image.fromarray(opaque.reshape(1, -1, 3))
        lut = np.asarray(strip.quantize(255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).getpalette()[:255 * 3], dtype=np.uint8).reshape(-1, 3)
    pal = Image.new('P', (1, 1))
    pal.putpalette(list(lut.reshape(-1)) + [0, 0, 0] * (256 - len(lut)))
    indexed, times = [], []
    for f, d in zip(frames, durations):
        p = np.asarray(f.convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE)).copy()
        p[np.asarray(f)[..., 3] == 0] = 255
        if indexed and np.array_equal(p, indexed[-1]):
            times[-1] += d  # a held pose is one frame shown longer
            continue
        indexed.append(p)
        times.append(d)
    out = []
    for p in indexed:
        im = Image.fromarray(p, 'P')
        im.putpalette(pal.getpalette())
        out.append(im)
    # GIF delays are centiseconds; carry the rounding forward so long clips keep their timing.
    delays, clock = [], 0.0
    for d in times:
        target = round((clock + d) / 10) * 10 - round(clock / 10) * 10
        delays.append(max(20, target))
        clock += d
    out[0].save(path, save_all=True, append_images=out[1:], duration=delays, loop=0, transparency=255, disposal=2, optimize=False)
    if shutil.which('gifsicle'):
        subprocess.run(['gifsicle', '-O3', '--no-warnings', '-b', path], check=True)
    check = Image.open(path)
    if check.n_frames != len(indexed):
        raise SystemExit(f'{name}: {check.n_frames} frames decoded, {len(indexed)} drawn')
    rgb = np.asarray(pal.getpalette(), dtype=np.uint8).reshape(-1, 3)
    for i, p in enumerate(indexed):
        check.seek(i)
        got = np.asarray(check.convert('RGBA'))
        show = p != 255
        if not np.array_equal(got[..., 3] > 0, show) or not np.array_equal(got[..., :3][show], rgb[p[show]]):
            raise SystemExit(f'{name}: frame {i} decodes differently')
    print(f'{name}: {len(frames)} frames ({len(indexed)} distinct), {frames[0].size[0]}x{frames[0].size[1]}, {len(lut)} colours, {os.path.getsize(path) / 1024 / 1024:.2f} MiB')


# ---------------------------------------------------------------- hero

# (idle loop, action while speaking, line)
HERO_LINES = {
    'claude': ('idle', 'confused', '中国人？'),
    'gpt': ('idle', 'probe', '先打个探针……'),
    'deepseek': ('idle', 'empty', '饭呢……'),
    'clawd': ('LookingAroundEyesOnly', 'Waving', '嗨！'),
}
HERO_TITLE = '会跟着 AI 干活的像素小同事'


def hero_layers(s=4, w=1280, h=560, title_y=24):
    base = canvas(w, h)
    logo = pixel_logo(24, 3)
    tw, th = text_size(HERO_TITLE, 5)
    x = (w - (logo.width + 6 * s + tw)) // 2
    base.alpha_composite(logo, (x, title_y))
    draw_text(base, (x + logo.width + 6 * s, title_y + (logo.height - th) // 2), HERO_TITLE, 5, YELLOW, outline=INK)
    ground = h - 64
    xs = [w // 2 + int((i - 1.5) * 290) for i in range(4)]
    for c, cx in zip(CHARACTERS, xs):
        pill(base, cx, ground + 4 * s, NAMES[c], s, ACCENT[c], scale=2, pad=(4, 1))
    return base, ground, xs


def hero_frame(t, period, layers):
    base, ground, xs = layers
    img = base.copy()
    turn = period / 4
    slot = int(t / turn) % 4
    for i, c in enumerate(CHARACTERS):
        idle, act, line = HERO_LINES[c]
        f = frame_at(c, act, t - slot * turn, 320) if i == slot else frame_at(c, idle, t, 320)
        place(img, f, xs[i], ground, c, 320)
    c = CHARACTERS[slot]
    bubble(img, xs[slot], ground - 268 + (56 if c != 'clawd' else 168), HERO_LINES[c][2], 3)
    return img


def build_hero(fps=10, period=8.0):
    layers = hero_layers()
    save_anim([hero_frame(n / fps, period, layers) for n in range(int(period * fps))], 'hero.gif', 1000 // fps)


def build_cover():
    """Static 1280x640 social card (also the site's og:image)."""
    w, h = 1280, 640
    img = Image.new('RGBA', (w, h), WHITE + (255,))
    base, ground, xs = hero_layers(h=h - 40, title_y=96)
    img.alpha_composite(base, (0, 0))
    for c, cx in zip(CHARACTERS, xs):
        idle = HERO_LINES[c][0]
        frames, _ = clip(c, idle, 320)
        place(img, frames[_packs[c]['animations'][idle].get('poster', 0)], cx, ground, c, 320)
    img.convert('RGB').save(os.path.join(OUT, 'cover.png'), optimize=True)
    print('cover.png')


# ---------------------------------------------------------------- work: state x character

WORK_STATES = [
    ('发送', {'claude': 'sending', 'gpt': 'wave', 'deepseek': 'fast', 'clawd': 'Running'}),
    ('思考', {'claude': 'thinking', 'gpt': 'thinking', 'deepseek': 'chain', 'clawd': 'Thinking'}),
    ('读代码', {'claude': 'reading', 'gpt': 'snapshot', 'deepseek': 'thinking', 'clawd': 'Laptop'}),
    ('跑命令', {'claude': 'typing', 'gpt': 'smoke', 'deepseek': 'typing', 'clawd': 'Desktop'}),
    ('完成', {'claude': 'happy', 'gpt': 'happy', 'deepseek': 'happy', 'clawd': 'JumpingHappy'}),
    ('出错', {'claude': 'error', 'gpt': 'error', 'deepseek': 'error', 'clawd': 'Facepalm'}),
]


def build_work(fps=10, period=4.0):
    # 4 s is one full loop of every HD clip, so the matrix repeats seamlessly.
    s, cell, row, head = 2, 168, 160, 64
    w, h = len(WORK_STATES) * cell, head + 4 * row
    base = canvas(w, h)
    for i, (label, _) in enumerate(WORK_STATES):
        pill(base, i * cell + cell // 2, 4, label, s, YELLOW, scale=3, pad=(6, 1))
    frames = []
    for n in range(int(period * fps)):
        t = n / fps
        img = base.copy()
        for i, (_, cast) in enumerate(WORK_STATES):
            cx = i * cell + cell // 2
            for r, c in enumerate(CHARACTERS):
                size = 240 if c == 'clawd' else 160
                place(img, frame_at(c, cast[c], t + phase(c, cast[c], i + r), size), cx, head + r * row + 146, c, size)
        frames.append(img)
    save_anim(frames, 'work.gif', 1000 // fps)


# ---------------------------------------------------------------- wall: every action

def build_wall(fps=10, period=4.0):
    cell, cols = 136, 11
    items = [(c, a) for c in CHARACTERS for a in actions(c)]
    rows = -(-len(items) // cols)
    w, h = cols * cell, rows * cell
    frames = []
    for n in range(int(period * fps)):
        t = n / fps
        img = canvas(w, h)
        for k, (c, a) in enumerate(items):
            x, y = k % cols * cell, k // cols * cell
            # Shown at about half size on GitHub, where the 80 px atlas looks the same as HD at a third of the weight.
            size = 240 if c == 'clawd' else 160
            place(img, frame_at(c, a, t + phase(c, a, k), size, pixel=True), x + cell // 2, y + 126, c, size)
        frames.append(img)
    save_anim(frames, 'wall.gif', 1000 // fps)
    print(f'wall: {len(items)} actions')


# ---------------------------------------------------------------- stories

STORIES = {
    'claude': [('special', None)],
    'gpt': [('probe', '先打个探针……'), ('gate', '检查89道门禁……'), ('smoke', '先跑个冒烟……'), ('matrix', '补个验收矩阵……'), ('typing', '终于开工。')],
    'deepseek': [('empty', '饭呢……'), ('hungry', '正在想办法吃大米饭……'), ('rice', '吃大米饭……'), ('steal', '正在想办法偷饭……'), ('sleep', '晕碳ing……')],
    'clawd': [('Waving', '嗨！'), ('Lightbulb', '有了！'), ('Laptop', '敲代码……'), ('JumpingHappy', '跑通了！'), ('Confetti', '撒花～'), ('Hula', '摸鱼……'), ('Facepalm', '又挂了。')],
}


def story_caption(c, action, step_caption, local, held):
    """The step's line, else the clip's latest caption so far; a bubble never blinks off between lines."""
    if step_caption:
        return step_caption
    for item in _packs[c]['animations'][action].get('captions', []):
        if item['start'] <= local:
            held = item['text']
    return held


def build_story(c):
    s, w, h = 4, 560, 480
    feet = h - 60
    base = canvas(w, h)
    pill(base, w // 2, feet + 4 * s, NAMES[c], s, ACCENT[c], scale=2, pad=(4, 1))
    frames, durations, held = [], [], ''
    for action, caption in STORIES[c]:
        size = 400 if c == 'clawd' else 320
        clip_frames, fps = clip(c, action, size)
        for n, f in enumerate(clip_frames):
            img = base.copy()
            place(img, f, w // 2, feet, c, size)
            held = story_caption(c, action, caption, n / fps, held)
            if held:
                bubble(img, w // 2, 100, held, 3)
            frames.append(img)
            durations.append(1000 / fps)
    save_anim(frames, f'story-{c}.gif', durations)


def build_stories():
    for c in CHARACTERS:
        build_story(c)


# ---------------------------------------------------------------- buttons

APPLE = ['.....#..', '....#...', '.##.###.', '########', '######..', '######..', '#######.', '########', '.######.', '..##.##.']
WINDOWS = ['###.###', '###.###', '###.###', '.......', '###.###', '###.###', '###.###']


def button(label, icon, name, s=3):
    tw, th = text_size(label, 3)
    iw, ih = len(icon[0]) * s, len(icon) * s
    pad, gap = 9 * s, 4 * s
    w, h = tw + iw + gap + 2 * pad, th + 2 * 6 * s
    img = canvas(w, h + 2 * s)
    pixel_rect(img, (0, 2 * s, w, h + 2 * s), YELLOW_EDGE, s, radius=2)
    pixel_rect(img, (0, 0, w, h), YELLOW, s, radius=2)
    d = ImageDraw.Draw(img)
    ix, iy = pad, (h - ih) // 2
    for r, line in enumerate(icon):
        for k, ch in enumerate(line):
            if ch == '#':
                d.rectangle((ix + k * s, iy + r * s, ix + (k + 1) * s - 1, iy + (r + 1) * s - 1), INK)
    draw_text(img, (pad + iw + gap, (h - th) // 2 + s), label, 3, INK)
    img.save(os.path.join(OUT, name), optimize=True)
    print(name, img.size)


def build_buttons():
    button('macOS · Apple 芯片', APPLE, 'btn-mac-arm.png')
    button('macOS · Intel', APPLE, 'btn-mac-intel.png')
    button('Windows', WINDOWS, 'btn-windows.png')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name in sys.argv[1:] or ['hero', 'work', 'wall', 'stories', 'buttons', 'cover']:
        globals()['build_' + name]()
