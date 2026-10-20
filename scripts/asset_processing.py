"""Shared offline white-background matte and shoe-root tracking for approved artwork."""
import cv2
import numpy as np


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

