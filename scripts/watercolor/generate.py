"""Paints every watercolour asset for the business site into public/img/paint.

    python3 scripts/watercolor/generate.py            # all assets
    python3 scripts/watercolor/generate.py hero work  # just some

Paintings are rendered on white and shown with `mix-blend-mode: multiply`, so
they glaze onto the page's paper colour the way transparent paint would.
Requires numpy and opencv-python-headless (see requirements.txt).
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from engine import (  # noqa: E402
    Canvas,
    Paper,
    blob,
    ellipse,
    periodic_noise,
    pixel_dissolve,
    rounded_rect,
    smoothstep,
    srgb_to_linear,
    to_rgba_on_white,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/img/paint'

# The studio palette. Cerulean carries the original brand blue; rose is the
# warm counterpart; where they overlap the glaze turns indigo-violet.
CERULEAN = '#1b78b4'
ROSE = '#d23f68'
OCHRE = '#d39a35'
SAP = '#5b8a32'
INDIGO = '#26275e'
SEPIA = '#5a4334'


def save(img_rgb8, name, quality=82, alpha=False):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    if alpha:
        rgba = to_rgba_on_white(img_rgb8)
        cv2.imwrite(str(path), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_WEBP_QUALITY, quality])
    else:
        cv2.imwrite(str(path), cv2.cvtColor(img_rgb8, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, quality])
    print(f'  {name}: {img_rgb8.shape[1]}x{img_rgb8.shape[0]}, {path.stat().st_size // 1024} KB')


def splatter(c, rng, cx, cy, spread, color, count=14, size=(3, 10), strength=0.42):
    for _ in range(count):
        ang = rng.uniform(0, 2 * math.pi)
        dist = abs(rng.normal(0, spread))
        x, y = cx + math.cos(ang) * dist, cy + math.sin(ang) * dist
        r = rng.uniform(*size)
        d = c.wash_density(blob(x, y, r, rng, n=8, wobble=0.3), layers=6, variance=0.08, base_depth=2, layer_depth=1)
        c.paint(d, color, strength=strength * rng.uniform(0.6, 1.1), edge=1.6, flow=0.0, hard=0.7, soften=0.7, granulation=0.05)


def fusion_pair(c, cx, cy, rx, ry, gap, seed_strength=0.52, blooms=(3, 2), layers=50):
    rot = math.radians(32)
    dx, dy = math.cos(rot) * 0 + gap / 2, 0
    left = ellipse(cx - dx, cy - dy, rx, ry, rot, n=16)
    right = ellipse(cx + dx, cy + dy, rx, ry, rot, n=16)
    d1 = c.wash_density(left, layers=layers, variance=0.045, texture=0.25)
    c.paint(d1, CERULEAN, strength=seed_strength, blooms=blooms[0], bloom_size=(rx * 0.08, rx * 0.2), pool=0.3, granulation=0.1)
    d2 = c.wash_density(right, layers=layers, variance=0.045, texture=0.25)
    c.paint(d2, ROSE, strength=seed_strength, blooms=blooms[1], bloom_size=(rx * 0.08, rx * 0.2), pool=0.3, granulation=0.06)


# ------------------------------------------------------------------ assets


def hero():
    """The studio mark, painted, with its right flank resolving into pixels."""
    W, H = 1320, 1400
    c = Canvas(W, H, seed=42)
    rng = np.random.default_rng(42)
    cx, cy = 600, 690
    fusion_pair(c, cx, cy, 285, 380, 300)
    splatter(c, rng, cx - 300, cy + 360, 60, CERULEAN, count=6)
    splatter(c, rng, cx + 60, cy - 450, 50, ROSE, count=5)
    img = c.rgb8()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    n = cv2.resize(periodic_noise(H // 8 + 1, W // 8 + 1, rng, beta=2.5), (W, H))
    u = xx / W + 0.035 * n - 0.06 * (yy / H - 0.5)
    field = smoothstep(0.6, 0.82, u)
    scatter = smoothstep(0.66, 0.9, u) * 0.9
    out = pixel_dissolve(img, cell=14, field=field, gap=2, scatter=scatter, reach=4.0, seed=4)
    # Cropped to the painting; the page's construction overlay uses viewBox "80 200 1240 1000".
    save(np.ascontiguousarray(out[200:1200, 80:1320]), 'hero-fusion.webp', quality=80)
    # Same painting, intact, for the default social card.
    save(np.ascontiguousarray(img[200:1200, 80:1320]), 'fusion-mark.webp', quality=80)


ASSETS = {'hero': hero}



# ------------------------------------------------------------- helpers 2


def ink(c, pts, width=2, color='#1d1a17', opacity=0.85, jitter=0.0, closed=False):
    c.ink_line(np.asarray(pts, np.float64), width=width, color=color, jitter=jitter, opacity=opacity, closed=closed)


def arc(cx, cy, r, a0, a1, n=120):
    t = np.linspace(a0, a1, n)
    return np.stack([cx + r * np.cos(t), cy + r * np.sin(t)], 1)


def dashed(c, pts, dash=14, gap=10, **kw):
    pts = np.asarray(pts, np.float64)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    period = dash + gap
    start = 0.0
    while start < s[-1]:
        end = min(start + dash, s[-1])
        idx = (s >= start) & (s <= end)
        if idx.sum() >= 2:
            ink(c, pts[idx], **kw)
        start += period


def frame_dissolve(img, rect, cell, gap=2, radius=40, seed=0):
    """Everything inside a rounded rect becomes flat pixel cells (a screen)."""
    h, w = img.shape[:2]
    x0, y0, x1, y1 = rect
    m = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m, [np.round(rounded_rect(x0, y0, x1, y1, radius)).astype(np.int32)], 1)
    field = m.astype(np.float32) * 1.01
    return pixel_dissolve(img, cell=cell, field=field, gap=gap, seed=seed)


def hills(c, rng, layers):
    for k, (base, amp, col, st) in enumerate(layers):
        xs = np.linspace(-80, c.w + 80, 28)
        ys = base + amp * np.sin(xs / 280 + k * 1.9) + rng.normal(0, 5, len(xs))
        poly = np.concatenate([np.stack([xs, ys], 1), [[c.w + 80, c.h + 80], [-80, c.h + 80]]])
        d = c.wash_density(poly, layers=30, variance=0.015, base_depth=2, layer_depth=2)
        c.paint(d, col, strength=st, edge=1.1, flow=0.4, granulation=0.18, blooms=1, bloom_size=(24, 50))


# ---------------------------------------------------------- case studies

WORK_W, WORK_H = 1600, 1000


def work_everybody():
    c = Canvas(WORK_W, WORK_H, seed=101)
    rng = np.random.default_rng(101)
    cx, cy, r = 820, 500, 330
    pts = []
    while len(pts) < 24:
        a = rng.uniform(0, 2 * math.pi)
        rr = r * math.sqrt(rng.uniform(0.03, 0.9))
        p = (cx + rr * math.cos(a), cy + rr * math.sin(a))
        if all(math.dist(p, q) > 46 for q in pts):
            pts.append(p)
    pts = np.array(pts)
    sizes = rng.uniform(9, 16, len(pts))
    # Masking fluid: the people stay clean paper under every wash.
    reserve = np.zeros((WORK_H, WORK_W), np.uint8)
    for (x, y), size in zip(pts, sizes):
        cv2.circle(reserve, (int(x), int(y)), int(size + 5), 255, -1, cv2.LINE_AA)
    keep = 1 - cv2.GaussianBlur(reserve.astype(np.float32) / 255, (0, 0), 1.2)
    d = c.wash_density(ellipse(cx - 150, cy + 40, r * 1.05, r * 0.95, 0.2, n=14), layers=40, variance=0.06)
    c.paint(d * keep, OCHRE, strength=0.3, pool=-0.2, blooms=2, bloom_size=(30, 60))
    d = c.wash_density(ellipse(cx, cy, r, r, 0, n=18), layers=50, variance=0.03, texture=0.2)
    c.paint(d * keep, CERULEAN, strength=0.42, pool=0.35, blooms=2, bloom_size=(30, 70))
    for k in range(-2, 3):
        t = np.linspace(-math.pi / 2, math.pi / 2, 90)
        xs = cx + math.sin(k * math.pi / 6) * r * np.cos(t)
        ys = cy + r * np.sin(t)
        ink(c, np.stack([xs, ys], 1), width=1, opacity=0.5)
    for k in range(-2, 3):
        y = cy + r * math.sin(k * math.pi / 6)
        half = r * math.cos(k * math.pi / 6)
        ink(c, [[cx - half, y], [cx + half, y]], width=1, opacity=0.45)
    ink(c, arc(cx, cy, r, 0, 2 * math.pi, 240), width=2, opacity=0.7, closed=True)
    # Connections between neighbours: one movement, many places.
    for i, p in enumerate(pts):
        dists = np.linalg.norm(pts - p, axis=1)
        for j in np.argsort(dists)[1:3]:
            if j > i and dists[j] < 190:
                ink(c, [p, pts[j]], width=1, opacity=0.6)
    for (x, y), size in zip(pts, sizes):
        d = c.wash_density(blob(x, y, size, rng, n=9, wobble=0.18), layers=10, variance=0.04, base_depth=2, layer_depth=1)
        c.paint(d, ROSE, strength=rng.uniform(0.6, 0.85), edge=1.5, flow=0, hard=0.8, soften=0.6)
    for x, y in pts[rng.choice(len(pts), 6, replace=False)]:
        ang = math.atan2(y - cy, x - cx)
        start = (cx + (r + 18) * math.cos(ang), cy + (r + 18) * math.sin(ang))
        end = (cx + (r + 120) * math.cos(ang), cy + (r + 120) * math.sin(ang))
        dashed(c, [start, end], dash=8, gap=7, width=1, opacity=0.6)
        d = c.wash_density(blob(*end, 10, rng, n=9), layers=10, variance=0.04, base_depth=2, layer_depth=1)
        c.paint(d, ROSE, strength=0.55, edge=1.4, flow=0, hard=0.8)
    save(c.rgb8(), 'work-everybody-everywhere.webp')


def work_radio():
    c = Canvas(WORK_W, WORK_H, seed=202)
    rng = np.random.default_rng(202)
    sx, sy = 560, 760
    colors = [ROSE, OCHRE, CERULEAN, ROSE, CERULEAN, OCHRE]
    for i, r in enumerate([150, 260, 380, 510, 650, 800]):
        path = arc(sx, sy, r, -math.pi * 0.62, math.pi * 0.05, 140)
        width = 34 - i * 3
        d = c.stroke_density(path, width, layers=26, variance=0.02, base_depth=2, layer_depth=2, texture=0.3)
        c.paint(d, colors[i], strength=0.62 - i * 0.06, edge=1.2, flow=0.35, hard=0.55, blooms=1 if i % 2 else 0, bloom_size=(12, 24))
    d = c.wash_density(blob(sx, sy, 62, rng, n=12, wobble=0.08), layers=30, variance=0.04)
    c.paint(d, ROSE, strength=0.85, edge=1.2, blooms=1, bloom_size=(14, 22))
    ink(c, arc(sx, sy, 92, 0, 2 * math.pi, 120), width=1, opacity=0.45, closed=True)
    # Precise listening marks along the outer arcs.
    for r in (260, 510, 800):
        for a in np.linspace(-math.pi * 0.6, math.pi * 0.03, 16):
            p0 = (sx + (r - 8) * math.cos(a), sy + (r - 8) * math.sin(a))
            p1 = (sx + (r + 8) * math.cos(a), sy + (r + 8) * math.sin(a))
            ink(c, [p0, p1], width=1, opacity=0.4)
    img = c.rgb8()
    yy, xx = np.mgrid[0:WORK_H, 0:WORK_W].astype(np.float32)
    dist = np.hypot(xx - sx, yy - sy)
    n = cv2.resize(periodic_noise(WORK_H // 8 + 1, WORK_W // 8 + 1, rng, beta=2.5), (WORK_W, WORK_H))
    field = smoothstep(560, 760, dist + 40 * n)
    out = pixel_dissolve(img, cell=12, field=field, gap=2, scatter=field * 0.6, reach=2.5, seed=2)
    save(out, 'work-radio-disney.webp')


def work_academy():
    c = Canvas(WORK_W, WORK_H, seed=303)
    rng = np.random.default_rng(303)
    yy, xx = np.mgrid[0:WORK_H, 0:WORK_W].astype(np.float32)
    sky = np.array([[-80, -80], [WORK_W + 80, -80], [WORK_W + 80, 700], [-80, 700]])
    d = c.wash_density(sky, layers=24, variance=0.02, base_depth=2, layer_depth=2)
    c.paint(d * smoothstep(-100, 700, yy), CERULEAN, strength=0.24, edge=0.2, flow=0.5, hard=0.3)
    hills(c, rng, [(700, 45, SAP, 0.3), (790, 35, SAP, 0.42), (880, 25, '#3f7a3c', 0.36)])
    # A swing sequence: club positions fanned around the hands, like a strobe photo.
    hx, hy, club = 800, 470, 330
    angles = np.linspace(math.radians(200), math.radians(-20), 12)
    tips = np.stack([hx + club * np.cos(angles), hy - club * np.sin(angles)], 1)
    path = np.stack([hx + club * np.cos(np.linspace(angles[0], angles[-1], 160)), hy - club * np.sin(np.linspace(angles[0], angles[-1], 160))], 1)
    d = c.stroke_density(path, np.linspace(10, 40, 160), layers=26, variance=0.02, base_depth=2, layer_depth=2)
    c.paint(d, ROSE, strength=0.5, edge=1.3, flow=0.3, hard=0.5)
    for i, (tx, ty) in enumerate(tips):
        ink(c, [[hx, hy], [tx, ty]], width=2 if i in (0, 6, 11) else 1, opacity=0.35 + 0.04 * i)
    ring = np.stack([hx + (club + 46) * np.cos(np.linspace(angles[0], angles[-1], 200)), hy - (club + 46) * np.sin(np.linspace(angles[0], angles[-1], 200))], 1)
    dashed(c, ring, dash=10, gap=9, width=1, opacity=0.6)
    for a in angles[::2]:
        p0 = (hx + (club + 36) * math.cos(a), hy - (club + 36) * math.sin(a))
        p1 = (hx + (club + 58) * math.cos(a), hy - (club + 58) * math.sin(a))
        ink(c, [p0, p1], width=1, opacity=0.7)
    ink(c, arc(hx, hy, 9, 0, 2 * math.pi, 30), width=2, opacity=0.8, closed=True)
    # The ball, on the ground below the bottom of the arc.
    bx, by = hx, hy + club + 18
    d = c.wash_density(ellipse(bx, by + 16, 46, 10, 0, n=12), layers=10, variance=0.03)
    c.paint(d, '#3f7a3c', strength=0.5)
    ink(c, arc(bx, by, 13, 0, 2 * math.pi, 40), width=2, opacity=0.85, closed=True)
    save(c.rgb8(), 'work-golf-channel-academy.webp')


def work_edd():
    c = Canvas(WORK_W, WORK_H, seed=404)
    rng = np.random.default_rng(404)
    base_y = 820
    heights = [190, 260, 230, 340, 420, 390, 520, 610]
    xs = np.linspace(330, 1270, len(heights))
    for i, (x, hgt) in enumerate(zip(xs, heights)):
        poly = rounded_rect(x - 44, base_y - hgt, x + 44, base_y, 12, n_corner=3)
        d = c.wash_density(poly, layers=26, variance=0.01, base_depth=2, layer_depth=2)
        c.paint(d, CERULEAN, strength=0.26 + 0.045 * i, edge=1.2, flow=0.4, pool=0.35, hard=0.6, granulation=0.15)
    # Trend: a confident painted stroke, then a precise line along it.
    tx = np.linspace(260, 1340, 60)
    ty = base_y - 210 - (tx - 260) / 1080 * 470 - 40 * np.sin((tx - 260) / 160)
    d = c.stroke_density(np.stack([tx, ty], 1), 14, layers=22, variance=0.015, base_depth=2, layer_depth=2)
    c.paint(d, ROSE, strength=0.75, edge=1.3, flow=0.2, hard=0.6)
    ink(c, np.stack([tx, ty - 26], 1), width=1, opacity=0.45)
    end = (tx[-1], ty[-1])
    d = c.wash_density(blob(*end, 22, rng, n=12, wobble=0.06), layers=16, variance=0.03)
    c.paint(d, ROSE, strength=0.95, edge=1.4)
    ink(c, arc(end[0], end[1], 40, 0, 2 * math.pi, 60), width=1, opacity=0.5, closed=True)
    ink(c, [[220, base_y + 2], [1380, base_y + 2]], width=2, opacity=0.8)
    for x in xs:
        ink(c, [[x, base_y + 2], [x, base_y + 18]], width=1, opacity=0.5)
    # A sale lands: coins of colour near the top bar.
    for _ in range(9):
        x, y = rng.normal(1270, 70), rng.normal(base_y - 700, 50)
        d = c.wash_density(blob(x, y, rng.uniform(5, 11), rng, n=8), layers=6, variance=0.05, base_depth=2, layer_depth=1)
        c.paint(d, OCHRE, strength=rng.uniform(0.5, 0.9), edge=1.4, flow=0, hard=0.8)
    img = c.rgb8()
    yy, xx = np.mgrid[0:WORK_H, 0:WORK_W].astype(np.float32)
    n = cv2.resize(periodic_noise(WORK_H // 8 + 1, WORK_W // 8 + 1, rng, beta=2.5), (WORK_W, WORK_H))
    field = smoothstep(1080, 1300, xx + 50 * n) * (yy < base_y)
    out = pixel_dissolve(img, cell=12, field=field, gap=2, seed=5)
    save(out, 'work-easy-digital-downloads.webp')


def work_golf_mobile():
    c = Canvas(WORK_W, WORK_H, seed=505)
    rng = np.random.default_rng(505)
    yy, xx = np.mgrid[0:WORK_H, 0:WORK_W].astype(np.float32)
    sky = np.array([[-80, -80], [WORK_W + 80, -80], [WORK_W + 80, 700], [-80, 700]])
    d = c.wash_density(sky, layers=24, variance=0.02, base_depth=2, layer_depth=2)
    c.paint(d * smoothstep(720, 80, yy), OCHRE, strength=0.4, edge=0.2, flow=0.5, hard=0.3)
    c.paint(d * smoothstep(-60, 520, yy) * smoothstep(760, 380, yy) * 0.9, ROSE, strength=0.24, edge=0.2, flow=0.5, hard=0.3)
    d = c.wash_density(ellipse(1080, 380, 120, 120, 0, n=16), layers=30, variance=0.02)
    c.paint(d, OCHRE, strength=0.4, edge=1.0, hard=0.5)
    hills(c, rng, [(610, 60, SAP, 0.3), (710, 45, '#3f7a3c', 0.32), (840, 30, SAP, 0.4)])
    # The pin.
    px, py = 520, 640
    ink(c, [[px, py], [px, py - 230]], width=3, opacity=0.9)
    flag = np.array([[px, py - 230], [px + 110, py - 200], [px, py - 168]])
    d = c.wash_density(flag, layers=20, variance=0.03, base_depth=2, layer_depth=2)
    c.paint(d, ROSE, strength=0.9, edge=1.3, hard=0.6)
    d = c.wash_density(ellipse(px, py + 6, 30, 9, 0, n=12), layers=10, variance=0.03)
    c.paint(d, '#3f7a3c', strength=0.5)
    img = c.rgb8()
    # A phone's worth of the same scene, rendered as pixels: the course on the go.
    rect = (900, 150, 1250, 860)
    out = frame_dissolve(img, rect, cell=12, gap=2, radius=46, seed=6)
    c2 = Canvas(WORK_W, WORK_H, seed=1)
    c2.lin = srgb_to_linear(np.asarray(out, np.float32) / 255)
    pts = rounded_rect(*rect, 46, n_corner=8)
    dense = np.concatenate([np.linspace(pts[i], pts[(i + 1) % len(pts)], 8, endpoint=False) for i in range(len(pts))])
    ink(c2, dense, width=3, opacity=0.9, closed=True)
    ink(c2, [[1040, 172], [1110, 172]], width=4, opacity=0.9)
    save(c2.rgb8(), 'work-golf-channel.webp')


ASSETS.update(
    {
        'work-ee': work_everybody,
        'work-radio': work_radio,
        'work-academy': work_academy,
        'work-edd': work_edd,
        'work-golf': work_golf_mobile,
    }
)

# ---------------------------------------------------------------- photos


def avatar():
    """A small square crop of the founder photo for the contact page."""
    src = cv2.imread(str(ROOT / 'public/img/us/matthew.jpg'))
    face = src[300:720, 140:560]
    small = cv2.resize(face, (160, 160), interpolation=cv2.INTER_AREA)
    path = ROOT / 'public/img/us/matthew-avatar.jpg'
    cv2.imwrite(str(path), small, [cv2.IMWRITE_JPEG_QUALITY, 86, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
    print(f'  {path.name}: 160x160, {path.stat().st_size // 1024} KB')


ASSETS['avatar'] = avatar

# -------------------------------------------------------------- services

SPOT = 720


def outline(c, pts, width=3, opacity=0.9, steps=8):
    pts = np.asarray(pts, np.float64)
    dense = np.concatenate([np.linspace(pts[i], pts[(i + 1) % len(pts)], steps, endpoint=False) for i in range(len(pts))])
    ink(c, dense, width=width, opacity=opacity, jitter=0.5, closed=True)


def service_mobile():
    c = Canvas(SPOT, SPOT, seed=601)
    d = c.wash_density(ellipse(300, 330, 170, 220, math.radians(32), n=14), layers=40, variance=0.05)
    c.paint(d, CERULEAN, strength=0.42, blooms=1, bloom_size=(20, 40), pool=0.3)
    d = c.wash_density(ellipse(430, 400, 150, 190, math.radians(32), n=14), layers=40, variance=0.05)
    c.paint(d, ROSE, strength=0.4, blooms=1, bloom_size=(20, 40), pool=0.3)
    img = c.rgb8()
    rect = (250, 120, 490, 600)
    out = frame_dissolve(img, rect, cell=12, gap=2, radius=36, seed=11)
    c2 = Canvas(SPOT, SPOT, seed=2)
    c2.lin = srgb_to_linear(out.astype(np.float32) / 255)
    outline(c2, rounded_rect(*rect, 36, n_corner=8))
    ink(c2, [[340, 140], [400, 140]], width=4, opacity=0.9)
    save(c2.rgb8(), 'service-mobile.webp')


def service_web():
    c = Canvas(SPOT, SPOT, seed=602)
    rng = np.random.default_rng(602)
    x0, y0, x1, y1 = 90, 170, 630, 560
    # A layout, painted: hero block, a column of text, three cards.
    d = c.wash_density(rounded_rect(130, 250, 590, 380, 10, 3), layers=30, variance=0.015, base_depth=2, layer_depth=2)
    c.paint(d, OCHRE, strength=0.45, edge=1.2, blooms=1, bloom_size=(16, 30), pool=0.3)
    d = c.wash_density(ellipse(470, 315, 40, 40, 0, n=12), layers=20, variance=0.03)
    c.paint(d, ROSE, strength=0.6)
    for i, col in enumerate([CERULEAN, ROSE, CERULEAN]):
        xa = 130 + i * 158
        d = c.wash_density(rounded_rect(xa, 410, xa + 138, 520, 10, 3), layers=24, variance=0.015, base_depth=2, layer_depth=2)
        c.paint(d, col, strength=0.32 + 0.06 * (i == 1), edge=1.2, pool=0.3)
    for k in range(3):
        ink(c, [[150, 285 + k * 26], [150 + (230 - k * 60), 285 + k * 26]], width=4, opacity=0.65, jitter=0.6)
    outline(c, rounded_rect(x0, y0, x1, y1, 18, n_corner=6))
    ink(c, [[x0, 222], [x1, 222]], width=2, opacity=0.85)
    for k in range(3):
        ink(c, arc(118 + k * 26, 196, 7, 0, 2 * math.pi, 24), width=2, opacity=0.85, closed=True)
    img = c.rgb8()
    yy, xx = np.mgrid[0:SPOT, 0:SPOT].astype(np.float32)
    field = smoothstep(470, 600, xx + 25 * cv2.resize(periodic_noise(SPOT // 8 + 1, SPOT // 8 + 1, rng), (SPOT, SPOT))) * ((yy > 240) & (yy < 535) & (xx < 606))
    out = pixel_dissolve(img, cell=10, field=field, gap=2, seed=12)
    save(out, 'service-web.webp')


def service_direction():
    c = Canvas(SPOT, SPOT, seed=603)
    rng = np.random.default_rng(603)
    t = np.linspace(0, 1, 120)
    xs = 110 + 500 * t
    ys = 600 - 440 * t + 110 * np.sin(t * 2 * math.pi * 1.25)
    path = np.stack([xs, ys], 1)
    d = c.stroke_density(path, np.linspace(30, 16, 120), layers=26, variance=0.02, base_depth=2, layer_depth=2)
    c.paint(d, OCHRE, strength=0.5, edge=1.2, flow=0.3, hard=0.55)
    dashed(c, path, dash=12, gap=10, width=2, opacity=0.8)
    for k in (0, 40, 80):
        x, y = path[k]
        ink(c, arc(x, y, 12, 0, 2 * math.pi, 30), width=2, opacity=0.85, closed=True)
    ex, ey = path[-1]
    d = c.wash_density(blob(ex, ey, 42, rng, n=12, wobble=0.08), layers=30, variance=0.03)
    c.paint(d, ROSE, strength=0.8, edge=1.3, blooms=1, bloom_size=(10, 16))
    ink(c, arc(ex, ey, 64, 0, 2 * math.pi, 80), width=1, opacity=0.6, closed=True)
    for a in range(4):
        ang = a * math.pi / 2
        ink(c, [[ex + 74 * math.cos(ang), ey + 74 * math.sin(ang)], [ex + 96 * math.cos(ang), ey + 96 * math.sin(ang)]], width=2, opacity=0.8)
    d = c.wash_density(ellipse(150, 590, 80, 46, -0.3, n=14), layers=24, variance=0.05)
    c.paint(d, CERULEAN, strength=0.3)
    save(c.rgb8(), 'service-direction.webp')


# ------------------------------------------------------- page furniture


def swatches():
    """Short horizontal brush marks used as highlighter behind words (RGBA)."""
    for name, col, seed in (('rose', ROSE, 701), ('cerulean', CERULEAN, 702), ('ochre', OCHRE, 703)):
        W, H = 1200, 240
        c = Canvas(W, H, seed=seed)
        rng = np.random.default_rng(seed)
        xs = np.linspace(40, W - 40, 40)
        ys = H * 0.55 + 10 * np.sin(xs / 220 + rng.uniform(0, 6)) - (xs - 40) * 0.02
        t = np.linspace(0, 1, 40)
        widths = 56 * np.clip(np.sin(np.pi * t), 0, 1) ** 0.22 * (1 - 0.15 * t) + 2
        d = c.stroke_density(np.stack([xs, ys], 1), widths, layers=30, variance=0.03, base_depth=2, layer_depth=2, texture=0.3)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        streak = cv2.resize(periodic_noise(H // 2 + 1, W // 24 + 1, rng, beta=1.6), (W, H), interpolation=cv2.INTER_CUBIC)
        dry = 1 - smoothstep(0.82, 1.0, xx / W) * smoothstep(-0.2, 0.6, streak)  # bristle gaps where the brush runs out
        c.paint(d * dry, col, strength=0.36, edge=1.5, flow=0.4, hard=0.5, pool=0.0, blooms=1, bloom_size=(14, 26))
        # Shown at most ~600px wide behind a word; half size keeps them light.
        small = cv2.resize(c.rgb8(), (W // 2, H // 2), interpolation=cv2.INTER_AREA)
        save(small, f'swatch-{name}.webp', quality=80, alpha=True)


def cta_wash():
    """A deep painted field for the closing call to action. Dark enough at its
    centre for white type; ragged at the edges."""
    W, H = 2400, 1000
    c = Canvas(W, H, seed=801)
    body = np.array([[60, 110], [W * 0.45, 60], [W - 70, 90], [W - 50, H * 0.55], [W - 100, H - 70], [W * 0.5, H - 50], [60, H - 90], [40, H * 0.45]], float)
    d = c.wash_density(body, layers=60, variance=0.03, base_depth=3, layer_depth=3, texture=0.12, texture_scale=400)
    c.paint(d, INDIGO, strength=1.05, edge=0.8, edge_width=3, flow=0.18, flow_scale=10, hard=0.8, granulation=0.05)
    d = c.wash_density(ellipse(W * 0.8, H * 0.35, 560, 300, 0.3, n=14), layers=40, variance=0.06, texture=0.1)
    c.paint(d * 0.9, ROSE, strength=0.22, edge=0.4, flow=0.2, hard=0.3, granulation=0.03)
    d = c.wash_density(ellipse(W * 0.16, H * 0.7, 560, 300, -0.2, n=14), layers=40, variance=0.06, texture=0.1)
    c.paint(d * 0.9, CERULEAN, strength=0.3, edge=0.4, flow=0.2, hard=0.3, granulation=0.03)
    save(c.rgb8(), 'cta-wash.webp', quality=78)
    # Portrait version for phones, so the wash never has to stretch.
    W, H = 1000, 1500
    c = Canvas(W, H, seed=802)
    body = np.array([[40, 70], [W * 0.5, 40], [W - 40, 80], [W - 30, H * 0.5], [W - 50, H - 60], [W * 0.5, H - 40], [40, H - 70], [30, H * 0.5]], float)
    d = c.wash_density(body, layers=60, variance=0.03, base_depth=3, layer_depth=3, texture=0.12, texture_scale=400)
    c.paint(d, INDIGO, strength=1.05, edge=0.8, edge_width=3, flow=0.18, flow_scale=10, hard=0.8, granulation=0.05)
    d = c.wash_density(ellipse(W * 0.8, H * 0.18, 300, 260, 0.3, n=14), layers=40, variance=0.06, texture=0.1)
    c.paint(d * 0.9, ROSE, strength=0.22, edge=0.4, flow=0.2, hard=0.3, granulation=0.03)
    d = c.wash_density(ellipse(W * 0.2, H * 0.85, 320, 260, -0.2, n=14), layers=40, variance=0.06, texture=0.1)
    c.paint(d * 0.9, CERULEAN, strength=0.3, edge=0.4, flow=0.2, hard=0.3, granulation=0.03)
    save(c.rgb8(), 'cta-wash-tall.webp', quality=78)


def paper_tile():
    """Seamless cold-press tile for the page background (shown at half size)."""
    from engine import linear_to_srgb as l2s

    p = Paper(640, 640, seed=900, tooth=2.0, strength=0.9)
    lin = p.tile('#f5f0e6')
    save((l2s(lin) * 255 + 0.5).astype(np.uint8), 'paper.webp', quality=70)


def step_dots():
    """Three small painted markers for the process: blue, the fused violet, rose."""
    for i, colors in enumerate(([CERULEAN], [CERULEAN, ROSE], [ROSE])):
        c = Canvas(160, 160, seed=950 + i)
        for k, col in enumerate(colors):
            off = (k - (len(colors) - 1) / 2) * 26
            d = c.wash_density(ellipse(80 + off, 80, 48, 58, math.radians(32), n=12), layers=24, variance=0.05)
            c.paint(d, col, strength=0.62, edge=1.3, flow=0.2, pool=0.2)
        save(c.rgb8(), f'step-{i + 1}.webp', quality=82)


ASSETS.update(
    {
        'dots': step_dots,
        'services': lambda: (service_mobile(), service_web(), service_direction()),
        'swatches': swatches,
        'cta': cta_wash,
        'paper': paper_tile,
    }
)

if __name__ == '__main__':
    wanted = sys.argv[1:] or list(ASSETS)
    for name in wanted:
        print(name)
        ASSETS[name]()
