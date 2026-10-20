"""Build website-only HD previews from the approved original videos.

Usage: python build-showcase.py --sources /local/sources.json --dependencies /local/pydeps
sources.json: {"claude": {"idle": {"path": "/original.mp4", "sha256": "..."}}, ...}
The original files and private source paths are never copied into the repository.
Requires OpenCV, NumPy, Pillow and FFmpeg. Runtime pet assets stay unchanged.
"""
import argparse, hashlib, json, math, subprocess, sys
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sources', required=True, type=Path)
parser.add_argument('--dependencies', action='append', default=[])
parser.add_argument('--only', default='')
args = parser.parse_args()
sys.path[:0] = args.dependencies
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'showcase'
OUT.mkdir(exist_ok=True)
BACKGROUND = (240, 237, 228)
SOURCES = json.loads(args.sources.read_text())
manifest_file = OUT / 'manifest.json'
manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {
    'version': 1, 'background': '#f0ede4', 'characters': {}}


def matte(im, character):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    foreground = ((im.min(2) <= 205) | (hsv[:, :, 1] >= 55)).astype('uint8')
    k = max(3, round(im.shape[0] / (18 if character == 'gpt' else 90)) | 1)
    barrier = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((k, k), 'uint8'))
    _, labels, _, _ = cv2.connectedComponentsWithStats(1 - barrier)
    edges = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    alpha = ~np.isin(labels, edges[edges != 0])
    n, labels, stats, _ = cv2.connectedComponentsWithStats(alpha.astype('uint8'))
    keep = [i for i in range(1, n) if stats[i, 4] > 60]
    return np.isin(labels, keep).astype('uint8') * 255


def boots(im, character, reference=None):
    r, g, b = cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype('int16').transpose(2, 0, 1)
    h, w = r.shape
    y, x = np.indices(r.shape)
    if character == 'deepseek':
        mask = (r < 65) & (g < 90) & (b < 140) & (b > r + 15) & (g > r + 4)
    else:
        mask = (r < 130) & (g < 110) & (b < 100) & (r > g + 8) & (g > b + 2)
    baseline = reference[1] if reference else h * .92
    mask &= (y > baseline - 90) & (y < baseline + 35)
    if reference is None:
        mask &= (x > w * .4) & (x < w * .6)
    n, _, stats, centers = cv2.connectedComponentsWithStats(mask.astype('uint8'))
    return [(float(centers[i, 0]), int(stats[i, 1] + stats[i, 3]), int(stats[i, 4]))
            for i in range(1, n) if stats[i, 4] > 80 and stats[i, 2] < w * .15
            and stats[i, 1] + stats[i, 3] > baseline - 50]


def root_track(frames, character, action, first_alpha):
    yy, xx = np.nonzero(first_alpha)
    candidates = sorted(boots(frames[0], character), key=lambda q: q[1], reverse=True)[:2]
    cx = np.mean([q[0] for q in candidates]) if candidates else (xx.min() + xx.max()) / 2
    baseline = max(q[1] for q in candidates) if candidates else yy.max() + 1
    half = abs(candidates[0][0] - candidates[1][0]) / 2 if len(candidates) == 2 else frames[0].shape[1] * .028
    reference = (float(cx), float(baseline))
    if character != 'gpt':
        return reference, np.array([reference] * len(frames))
    last, result = cx, []
    for im in frames:
        candidates = [q for q in boots(im, character, reference) if abs(q[0] - last) < im.shape[1] * .22]
        if len(candidates) >= 2:
            pairs = [(a, b) for i, a in enumerate(candidates) for b in candidates[i + 1:]
                     if half * .6 < abs(a[0] - b[0]) < half * 3.5 and abs(a[1] - b[1]) < 25]
            if pairs:
                a, b = min(pairs, key=lambda pair: abs((pair[0][0] + pair[1][0]) / 2 - last)
                           + abs(abs(pair[0][0] - pair[1][0]) - 2 * half) * .2)
                last, bottom = (a[0] + b[0]) / 2, max(a[1], b[1])
            else:
                a = min(candidates, key=lambda q: abs(q[0] - last))
                last, bottom = a[0], a[1]
        elif candidates:
            a = min(candidates, key=lambda q: abs(q[0] - last))
            last = min([a[0] - half, a[0] + half], key=lambda x: abs(x - last))
            bottom = a[1]
        else:
            bottom = baseline
        result.append((last, baseline if action in ['dance', 'happy', 'special'] else bottom))
    track = np.array(result)
    for axis in range(2):
        track[:, axis] = [np.median(track[max(0, i - 2):i + 3, axis]) for i in range(len(track))]
    return reference, track


for character, items in SOURCES.items():
    animations = json.loads((ROOT / 'assets' / character / 'manifest.json').read_text())['animations']
    manifest['characters'].setdefault(character, {})
    for action, source in items.items():
        if args.only and f'{character}/{action}' not in args.only.split(','):
            continue
        entry = animations[action]
        destination = OUT / character
        destination.mkdir(exist_ok=True)
        if manifest['characters'][character].get(action, {}).get('sourceSha256') == source['sha256'] \
                and all((destination / f'{action}-{q}.mp4').exists() for q in ['360', '720']):
            continue
        original = Path(source['path']).resolve()
        assert hashlib.sha256(original.read_bytes()).hexdigest() == source['sha256'], 'Source changed'
        speed = 1.55 if character == 'deepseek' and action == 'fast' else 1
        cap = cv2.VideoCapture(str(original))
        rate = cap.get(cv2.CAP_PROP_FPS)
        samples, next_sample, i = [], 0, 0
        while True:
            ok, im = cap.read()
            if not ok:
                break
            time = i / rate / speed
            i += 1
            if time + 1e-6 >= next_sample:
                samples.append(im)
                next_sample += .05
        cap.release()
        reference, track = root_track(samples, character, action, matte(samples[0], character))
        # Same root and actor scale as the optimized assets, measured on source pixels.
        yy, _ = np.nonzero(matte(samples[0], character))
        scale = 486 / (reference[1] - yy.min())
        sample_times = np.arange(len(track)) / 20
        width = round(entry['width'] / 80 * 720 / 2) * 2
        final_files = [destination / f'{action}-{q}.mp4' for q in ['720', '360']]
        temporary = [p.with_name(p.stem + '.building.mp4') for p in final_files]
        command = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s',
                   f'{width}x720', '-r', str(rate * speed), '-i', 'pipe:0', '-filter_complex',
                   '[0:v]split=2[hd][low];[low]scale=-2:360:flags=lanczos[small]']
        for label, output in zip(['hd', 'small'], temporary):
            command += ['-map', f'[{label}]', '-c:v', 'libx264', '-threads', '2', '-preset', 'fast',
                        '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', str(output)]
        process = subprocess.Popen(command, stdin=subprocess.PIPE)
        cap, index, last_cell = cv2.VideoCapture(str(original)), 0, None
        poster_index = round(entry['poster'] / entry['fps'] * rate * speed)
        try:
            while True:
                ok, im = cap.read()
                if not ok:
                    break
                time = index / rate / speed
                cx, baseline = [np.interp(time, sample_times, track[:, axis]) for axis in range(2)]
                alpha = matte(im, character)
                if np.count_nonzero(alpha) >= 200:
                    rgba = Image.fromarray(np.dstack((cv2.cvtColor(im, cv2.COLOR_BGR2RGB), alpha)))
                    rgba = rgba.resize((round(im.shape[1] * scale), round(im.shape[0] * scale)), Image.Resampling.BOX)
                    cell = Image.new('RGBA', (width, 720))
                    cell.alpha_composite(rgba, (round(width / 2 - cx * scale), round(603 - baseline * scale)))
                    last_cell = cell
                else:
                    assert last_cell is not None, 'Empty first frame'
                    cell = last_cell
                if action == 'idle' and index == poster_index:
                    (OUT / 'posters').mkdir(exist_ok=True)
                    cell.save(OUT / 'posters' / f'{character}.png', optimize=True)
                bg = Image.new('RGB', cell.size, BACKGROUND)
                bg.paste(cell, mask=cell.getchannel('A'))
                process.stdin.write(bg.tobytes())
                index += 1
            process.stdin.close()
            assert process.wait() == 0, 'FFmpeg failed'
        except BaseException:
            process.kill()
            raise
        finally:
            cap.release()
        for staged, final in zip(temporary, final_files):
            staged.replace(final)
        manifest['characters'][character][action] = {
            'duration': index / rate / speed, 'fps': rate * speed, 'width': width, 'height': 720,
            'frames': index, 'sourceSha256': source['sha256'],
            'sources': {q: f'media/{character}/{action}-{q}.mp4' for q in ['360', '720']}}
        manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        print(character, action, index, f'{width}x720', sum(p.stat().st_size for p in final_files), flush=True)
        del samples
