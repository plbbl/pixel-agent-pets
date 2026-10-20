#!/usr/bin/env python3
"""Render the README visuals from the real animation sources.

Everything is composed at final resolution with nearest-neighbour scaling only:
HD characters come from assets-hd (320/160 px), Clawd from its 80 px atlas at an
integer scale, and all text uses the 12 px Fusion Pixel bitmap font (SIL OFL).

    python3 scripts/build-readme-media.py [hero work wall stories buttons cover]
"""
import io
import json
import os
import sys
import urllib.request
import zipfile
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'media')
FONT = os.environ.get('PIXEL_FONT') or os.path.join(ROOT, 'work', 'fonts', 'fusion-pixel-12px-proportional-zh_hans.ms.bitmap.ttf')
FONT_ZIP = 'https://github.com/TakWolf/fusion-pixel-font/releases/download/2026.10.16/fusion-pixel-font-12px-proportional-ms.bitmap.ttf-v2026.10.16.zip'

# Palette: a night desk lit by the four characters' own colours.
INK = (16, 17, 30)
SKY = [(20, 21, 38), (24, 24, 45), (29, 28, 53), (35, 32, 62), (42, 36, 70)]
FLOOR_TOP = (74, 62, 104)
FLOOR = (48, 41, 74)
FLOOR_DARK = (36, 31, 57)
WHITE = (246, 242, 233)
MUTED = (160, 154, 190)
DIM = (104, 99, 138)
YELLOW = (255, 210, 64)
ACCENT = {'claude': (240, 128, 64), 'gpt': (232, 232, 232), 'deepseek': (64, 140, 255), 'clawd': (217, 119, 87)}
NAMES = {'claude': 'Claude', 'gpt': 'GPT', 'deepseek': 'DeepSeek', 'clawd': 'Clawd'}
CHARACTERS = ['claude', 'gpt', 'deepseek', 'clawd']

_hd = json.load(open(os.path.join(ROOT, 'assets-hd', 'manifest.json')))
_packs = {c: json.load(open(os.path.join(ROOT, 'assets', c, 'manifest.json'))) for c in CHARACTERS}


# ---------------------------------------------------------------- sources

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
        return tuple(frames), v['fps']
    a = _packs[character]['animations'][action]
    sheet = Image.open(os.path.join(ROOT, 'assets', character, a['file'])).convert('RGBA')
    scale = size // a['height']
    frames = []
    for n in range(a['frames']):
        x, y = n % a['columns'] * a['width'], n // a['columns'] * a['height']
        frames.append(sheet.crop((x, y, x + a['width'], y + a['height'])).resize((a['width'] * scale, a['height'] * scale), Image.NEAREST))
    return tuple(frames), a['fps']


def frame_at(character, action, t, size=320, loop=True, pixel=False):
    frames, fps = clip(character, action, size, pixel)
    n = int(t * fps + 1e-6)
    return frames[n % len(frames)] if loop else frames[min(n, len(frames) - 1)]


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
    left, top, right, bottom = f.getbbox(text)
    w, h = max(1, right), 13
    im = Image.new('L', (w + 1, h), 0)
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    d.text((0, -1), text, font=f, fill=255)
    return im.crop((0, 0, w, h))


def text_size(text, scale):
    m = glyphs(text)
    return m.width * scale, m.height * scale


def draw_text(img, xy, text, scale, color, shadow=None, anchor='l'):
    m = glyphs(text)
    w, h = m.width * scale, m.height * scale
    x, y = xy
    if anchor == 'c':
        x -= w // 2
    elif anchor == 'r':
        x -= w
    big = m.resize((w, h), Image.NEAREST)
    if shadow:
        img.paste(Image.new('RGBA', (w, h), shadow + (255,)), (x + scale, y + scale), big)
    img.paste(Image.new('RGBA', (w, h), color + (255,)), (x, y), big)
    return w, h


# ---------------------------------------------------------------- pixel shapes

def pixel_rect(img, box, fill, s, radius=2, border=None):
    """Rectangle with stepped pixel corners on an s-pixel grid."""
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    steps = [radius - i for i in range(radius)]  # inset per row from the corner
    def body(col, inset):
        for r, k in enumerate(steps):
            d.rectangle((x0 + (k + inset) * s, y0 + (r + inset) * s, x1 - (k + inset) * s - 1, y0 + (r + inset + 1) * s - 1), col)
            d.rectangle((x0 + (k + inset) * s, y1 - (r + inset + 1) * s, x1 - (k + inset) * s - 1, y1 - (r + inset) * s - 1), col)
        d.rectangle((x0 + inset * s, y0 + (radius + inset) * s, x1 - inset * s - 1, y1 - (radius + inset) * s - 1), col)
    if border:
        body(border, 0)
        body(fill, 1)
    else:
        body(fill, 0)


def bubble(img, cx, bottom, text, s, fill=WHITE, ink=INK):
    tw, th = text_size(text, s)
    pad_x, pad_y = 5 * s, 3 * s
    w, h = tw + 2 * pad_x, th + 2 * pad_y
    x0, y0 = cx - w // 2, bottom - h - 3 * s
    pixel_rect(img, (x0, y0, x0 + w, y0 + h), fill, s, radius=2)
    d = ImageDraw.Draw(img)
    for i in range(3):  # tail
        d.rectangle((cx - (2 - i) * s, y0 + h + i * s, cx + s - 1, y0 + h + (i + 1) * s - 1), fill)
    draw_text(img, (cx, y0 + pad_y), text, s, ink, anchor='c')


def sky(w, h, s, bands=SKY):
    """Vertical banded gradient with a one-row checker dither between bands."""
    img = Image.new('RGBA', (w, h), bands[0] + (255,))
    d = ImageDraw.Draw(img)
    band = h / len(bands)
    for i, col in enumerate(bands):
        y0 = int(i * band) // s * s
        d.rectangle((0, y0, w, h), col)
        if i:
            prev = bands[i - 1]
            for x in range(0, w, s):
                if (x // s) % 2:
                    d.rectangle((x, y0, x + s - 1, y0 + s - 1), prev)
            for x in range(0, w, 2 * s):
                d.rectangle((x, y0 - s, x + s - 1, y0 - 1), col)
    return img


def stars(img, t, s, seed=7, count=60, top=0, bottom=None, color=WHITE, avoid=()):
    import random
    rng = random.Random(seed)
    w, h = img.size
    bottom = bottom or h
    d = ImageDraw.Draw(img)
    for i in range(count):
        x = rng.randrange(0, w // s) * s
        y = rng.randrange(top // s, bottom // s) * s
        if any(ax0 - 6 * s <= x <= ax1 + 6 * s and ay0 - 4 * s <= y <= ay1 + 4 * s for ax0, ay0, ax1, ay1 in avoid):
            continue
        phase = rng.random()
        period = rng.choice([1.6, 2.0, 2.4, 3.2])
        on = ((t / period + phase) % 1.0) < 0.82
        big = i % 9 == 0
        c = color if on else DIM
        if big and on:
            d.rectangle((x, y - s, x + s - 1, y + 2 * s - 1), c)
            d.rectangle((x - s, y, x + 2 * s - 1, y + s - 1), c)
        else:
            dim = tuple(int(v * (0.45 if i % 3 else 0.75)) for v in c)
            d.rectangle((x, y, x + s - 1, y + s - 1), dim)


def floor(img, y, s):
    """A desk edge: bright lip, shaded face, then low-contrast tiles."""
    w, h = img.size
    d = ImageDraw.Draw(img)
    d.rectangle((0, y, w, h), FLOOR)
    d.rectangle((0, y, w, y + s - 1), FLOOR_TOP)
    d.rectangle((0, y + s, w, y + 3 * s - 1), FLOOR_DARK)
    row, tile = 6 * s, 24 * s
    for k, ty in enumerate(range(y + 3 * s + row, h, row)):
        d.rectangle((0, ty, w, ty + s - 1), FLOOR_DARK)
        for x in range((k % 2) * tile // 2, w, tile):
            d.rectangle((x, ty - row + s, x + s - 1, ty - 1), FLOOR_DARK)


def shadow(img, cx, y, half, s, col=(30, 26, 48)):
    d = ImageDraw.Draw(img)
    d.rectangle((cx - half + 2 * s, y, cx + half - 2 * s, y + s - 1), col)
    d.rectangle((cx - half, y + s, cx + half, y + 2 * s - 1), col)
    d.rectangle((cx - half + 3 * s, y + 2 * s, cx + half - 3 * s, y + 3 * s - 1), col)


def pixel_logo(px=24, scale=4):
    logo = Image.open(os.path.join(ROOT, 'docs', 'media', 'baobaolong.png')).convert('RGB')
    small = logo.resize((px, px), Image.LANCZOS).quantize(colors=8, dither=Image.Dither.NONE).convert('RGBA')
    big = small.resize((px * scale, px * scale), Image.NEAREST)
    mask = Image.new('L', big.size, 0)
    pixel_rect(mask, (0, 0, big.width, big.height), 255, scale, radius=2)
    out = Image.new('RGBA', big.size, (0, 0, 0, 0))
    out.paste(big, (0, 0), mask)
    return out


# ---------------------------------------------------------------- output

def save_anim(frames, name, ms):
    path = os.path.join(OUT, name)
    n = len(frames)
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=ms, loop=0,
                   lossless=True, quality=100, method=4, kmin=n - 1, kmax=n)
    print(f'{name}: {n} frames, {frames[0].size[0]}x{frames[0].size[1]}, {os.path.getsize(path) / 1024 / 1024:.2f} MiB')


def backdrop(w, h, s, ground=None):
    img = sky(w, h, s)
    if ground is not None:
        floor(img, ground, s)
    return img


def card_mask(w, h, s, radius=3):
    mask = Image.new('L', (w, h), 0)
    pixel_rect(mask, (0, 0, w, h), 255, s, radius=radius)
    return mask


# ---------------------------------------------------------------- hero

# (idle loop, action while speaking, line)
HERO_LINES = {
    'claude': ('idle', 'confused', '中国人？'),
    'gpt': ('idle', 'probe', '先打个探针……'),
    'deepseek': ('idle', 'empty', '饭呢……'),
    'clawd': ('LookingAroundEyesOnly', 'Waving', '嗨！'),
}


def hero_layers(s=4, w=1280, h=680):
    """Static backdrop of the hero, rendered once."""
    img = sky(w, h, s)
    head, sub = '会跟着 AI 干活的像素小同事', 'Codex · DeepSeek Harness · macOS · Windows'
    hw, hh = text_size(head, 5)
    sw, sh = text_size(sub, 3)
    logo = pixel_logo(24, 3)
    ground = h - 88
    floor(img, ground, s)
    img.alpha_composite(logo, (8 * s, 7 * s))
    draw_text(img, (8 * s + logo.width + 4 * s, 7 * s + 1 * s), '抱抱龙', 3, WHITE)
    draw_text(img, (8 * s + logo.width + 4 * s, 7 * s + 11 * s), 'PIXEL AGENT PETS', 2, MUTED)
    draw_text(img, (w // 2, 38 * s), head, 5, WHITE, shadow=INK, anchor='c')
    draw_text(img, (w // 2, 58 * s), sub, 3, MUTED, anchor='c')
    xs = [w // 2 + int((i - 1.5) * 290) for i in range(4)]
    for c, cx in zip(CHARACTERS, xs):
        shadow(img, cx, ground, 20 * s if c != 'clawd' else 16 * s, s)
        draw_text(img, (cx, ground + 6 * s), NAMES[c], 3, ACCENT[c], shadow=INK, anchor='c')
    avoid = [(w // 2 - hw // 2, 38 * s, w // 2 + hw // 2, 38 * s + hh), (w // 2 - sw // 2, 58 * s, w // 2 + sw // 2, 58 * s + sh),
             (8 * s, 7 * s, 8 * s + logo.width + 60 * s, 7 * s + logo.height)]
    return img, card_mask(w, h, s), avoid, ground, xs


def hero_frame(t, period, layers, s=4):
    base, mask, avoid, ground, xs = layers
    img = base.copy()
    stars(img, t, s, count=70, bottom=ground - 230, avoid=avoid)
    turn = period / 4
    slot = int(t / turn) % 4
    for i, c in enumerate(CHARACTERS):
        idle, act, line = HERO_LINES[c]
        f = frame_at(c, act, t - slot * turn, 320) if i == slot else frame_at(c, idle, t, 320)
        place(img, f, xs[i], ground - 2, c, 320)
        if i == slot:
            bubble(img, xs[i], ground - 270 + (52 if c != 'clawd' else 168), line, 3)
    img.putalpha(mask)
    return img


def build_hero(fps=20, period=8.0):
    layers = hero_layers()
    save_anim([hero_frame(n / fps, period, layers) for n in range(int(period * fps))], 'hero.webp', 1000 // fps)


def build_cover():
    """Static 1280x640 social card (also the site's og:image)."""
    img, _, avoid, ground, xs = hero_layers(h=640)
    stars(img, 0.0, 4, count=70, bottom=ground - 230, avoid=avoid)
    for c, cx in zip(CHARACTERS, xs):
        idle = HERO_LINES[c][0]
        frames, _ = clip(c, idle, 320)
        place(img, frames[_packs[c]['animations'][idle].get('poster', 0)], cx, ground - 2, c, 320)
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


def build_work(fps=10, step=4 / 6):
    # 4 s is one full loop of every HD clip, so the matrix repeats seamlessly.
    s, cell, row, pad, head = 2, 168, 172, 28, 64
    cols = len(WORK_STATES)
    w, h = pad * 2 + cols * cell, head + pad + 4 * row + 8
    base = backdrop(w, h, s)
    d = ImageDraw.Draw(base)
    for r in range(4):  # one desk edge per character row
        y = head + pad + r * row + 140
        d.rectangle((pad, y, w - pad - 1, y + s - 1), FLOOR_TOP)
        d.rectangle((pad, y + s, w - pad - 1, y + 3 * s - 1), FLOOR_DARK)
    mask = card_mask(w, h, s, radius=4)
    period = cols * step
    frames = []
    for n in range(int(period * fps)):
        t = n / fps
        active = int(t / step) % cols
        img = base.copy()
        x0 = pad + active * cell
        pixel_rect(img, (x0 + 2 * s, 14, x0 + cell - 2 * s, h - 14), (40, 38, 70), s, radius=3, border=(255, 210, 64))
        pixel_rect(img, (x0 + 2 * s + 2 * s, 14 + 2 * s, x0 + cell - 4 * s, h - 14 - 2 * s), SKY[2], s, radius=2)
        for i, (label, cast) in enumerate(WORK_STATES):
            cx = pad + i * cell + cell // 2
            draw_text(img, (cx, 22), label, 3, YELLOW if i == active else MUTED, anchor='c')
            for r, c in enumerate(CHARACTERS):
                size = 240 if c == 'clawd' else 160
                place(img, frame_at(c, cast[c], t + phase(c, cast[c], i + r), size), cx, head + pad + r * row + 140, c, size)
        img.putalpha(mask)
        frames.append(img)
    save_anim(frames, 'work.webp', 1000 // fps)


# ---------------------------------------------------------------- wall: every action

def build_wall(fps=10, period=4.0):
    s, cell, cols, pad = 2, 136, 11, 20
    items = [(c, a) for c in CHARACTERS for a in actions(c)]
    rows = -(-len(items) // cols)
    w, h = pad * 2 + cols * cell, pad * 2 + rows * cell
    base = backdrop(w, h, s)
    d = ImageDraw.Draw(base)
    for k, (c, a) in enumerate(items):  # a coloured tick under each slot says whose action it is
        x, y = pad + k % cols * cell, pad + k // cols * cell
        d.rectangle((x + cell // 2 - 12, y + cell - 10, x + cell // 2 + 11, y + cell - 10 + s - 1), ACCENT[c])
    mask = card_mask(w, h, s, radius=4)
    frames = []
    for n in range(int(period * fps)):
        t = n / fps
        img = base.copy()
        for k, (c, a) in enumerate(items):
            x, y = pad + k % cols * cell, pad + k // cols * cell
            # Shown at about half size on GitHub, where the 80 px atlas looks the same as HD at a third of the weight.
            size = 240 if c == 'clawd' else 160
            place(img, frame_at(c, a, t + phase(c, a, k), size, pixel=True), x + cell // 2, y + 118, c, size)
        img.putalpha(mask)
        frames.append(img)
    save_anim(frames, 'wall.webp', 1000 // fps)
    print(f'wall: {len(items)} actions')


# ---------------------------------------------------------------- stories

STORIES = {
    'claude': [('special', None)],
    'gpt': [('probe', '先打个探针……'), ('gate', '检查89道门禁……'), ('smoke', '先跑个冒烟……'), ('matrix', '补个验收矩阵……'), ('typing', '终于开工。')],
    'deepseek': [('empty', '饭呢……'), ('hungry', '正在想办法吃大米饭……'), ('rice', '吃大米饭……'), ('steal', '正在想办法偷饭……'), ('sleep', '晕碳ing……')],
    'clawd': [('Waving', '嗨！'), ('Lightbulb', '有了！'), ('Laptop', '敲代码……'), ('JumpingHappy', '跑通了！'), ('Confetti', '撒花～'), ('Hula', '摸鱼……'), ('Facepalm', '又挂了。')],
}


def story_caption(c, action, step_caption, local):
    if step_caption:
        return step_caption
    for item in _packs[c]['animations'][action].get('captions', []):
        if item['start'] <= local < item['end']:
            return item['text']
    return ''


STORY_LINES = {
    'claude': '中文？→ 中国人？→ 封禁',
    'gpt': '探针 → 门禁 → 冒烟 → 验收矩阵 → 开工',
    'deepseek': '没饭 → 讨饭 → 吃饭 → 偷饭 → 晕碳',
    'clawd': 'Claude Desktop 原版 · 25 套动作',
}


def build_story(c):
    s, w, h = 4, 560, 520
    ground = h - 120
    base = backdrop(w, h, s, ground)
    ImageDraw.Draw(base).rectangle((0, ground + 3 * s, w, h), (30, 27, 50))
    shadow(base, w // 2, ground, 20 * s if c != 'clawd' else 16 * s, s)
    draw_text(base, (8 * s, ground + 7 * s), NAMES[c], 3, ACCENT[c], shadow=INK)
    draw_text(base, (8 * s, ground + 18 * s), STORY_LINES[c], 2, MUTED)
    mask = card_mask(w, h, s)
    frames, durations = [], []
    for action, caption in STORIES[c]:
        size = 400 if c == 'clawd' else 320
        clip_frames, fps = clip(c, action, size)
        for n, f in enumerate(clip_frames):
            img = base.copy()
            place(img, f, w // 2, ground - 2, c, size)
            text = story_caption(c, action, caption, n / fps)
            if text:
                bubble(img, w // 2, 96, text, 3)
            img.putalpha(mask)
            frames.append(img)
            durations.append(round(1000 / fps))
    path = f'story-{c}.webp'
    save_anim(frames, path, durations)


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
    img = Image.new('RGBA', (w, h + 2 * s), (0, 0, 0, 0))
    pixel_rect(img, (0, 2 * s, w, h + 2 * s), (176, 128, 20), s, radius=2)
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
