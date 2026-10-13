"""A small watercolor renderer built on numpy and OpenCV.

Washes follow Tyler Hobbs' layered-polygon method: a base shape is deformed by
recursive midpoint displacement, then dozens of further-deformed copies are
stacked at low opacity. Pigment is composited with Beer-Lambert absorption in
linear light, so overlapping colours glaze and mix the way transparent paint
does (blue over yellow reads green, two strong pigments go dark). Paper tooth,
granulation, dried edges and blooms come from periodic noise fields.

Everything is seeded, so a given script always paints the same picture.
"""

from __future__ import annotations

import math

import cv2
import numpy as np


# ---------------------------------------------------------------- colour


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def hex_rgb(value: str):
    value = value.lstrip('#')
    return np.array([int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


# Pigments as they look at full strength on white paper (sRGB).
PIGMENTS = {
    'ultramarine': '#2a3f9e',
    'cerulean': '#1d7fb8',
    'indigo': '#1f2a4f',
    'payne': '#2c3440',
    'vermilion': '#e24a26',
    'rose': '#d0416f',
    'ochre': '#d39a35',
    'sienna': '#b45a2b',
    'sap': '#5b8a32',
    'viridian': '#1f7a63',
    'teal': '#1b8a8f',
    'lemon': '#e9c933',
    'violet': '#5b3c8c',
    'sepia': '#5a4334',
}


def pigment(name_or_hex: str):
    value = PIGMENTS.get(name_or_hex, name_or_hex)
    return hex_rgb(value)


# ----------------------------------------------------------------- noise


def periodic_noise(h, w, rng, beta=2.0, low=0.0, high=1.0):
    """Zero-mean, unit-variance 1/f^beta noise that tiles seamlessly."""
    white = rng.standard_normal((h, w)).astype(np.float32)
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    amp = 1.0 / np.power(f, beta / 2.0)
    amp[(f < low) | (f > high)] = 0
    amp[0, 0] = 0
    field = np.real(np.fft.ifft2(np.fft.fft2(white) * amp)).astype(np.float32)
    field -= field.mean()
    std = field.std()
    return field / std if std > 0 else field


def periodic_blur(field, sigma):
    """Gaussian blur that wraps at the edges (keeps textures tileable)."""
    h, w = field.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    kernel = np.exp(-2 * (math.pi * sigma) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(field) * kernel)).astype(np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ----------------------------------------------------------------- paper


class Paper:
    """Cold-press paper: a height field for granulation plus a lit surface."""

    def __init__(self, h, w, seed=1, tooth=2.4, strength=1.0):
        rng = np.random.default_rng(seed)
        self.h, self.w = h, w
        # Tooth: a few pixels across, like cold-press texture at 2x.
        t = periodic_blur(rng.standard_normal((h, w)).astype(np.float32), tooth)
        t = (t - t.mean()) / (t.std() + 1e-6)
        medium = periodic_noise(h, w, rng, beta=2.0, low=1 / 90, high=1 / 6)
        mottle = periodic_noise(h, w, rng, beta=2.6, high=1 / 40)
        height = 0.72 * t + 0.28 * medium
        self.height = (height - height.mean()) / (height.std() + 1e-6)
        gx = np.roll(self.height, -1, 1) - np.roll(self.height, 1, 1)
        gy = np.roll(self.height, -1, 0) - np.roll(self.height, 1, 0)
        shade = -(0.55 * gx + 0.83 * gy)
        shade /= shade.std() + 1e-6
        self.surface = 1.0 + strength * (0.022 * shade + 0.010 * mottle)
        self.mottle = mottle

    def tile(self, color='#f6f1e7'):
        base = srgb_to_linear(hex_rgb(color))
        lin = np.clip(base[None, None, :] * self.surface[..., None], 0, 1)
        return lin


# ---------------------------------------------------------------- shapes


def deform(points, variance, depth, rng, amount=1.0):
    """Recursive midpoint displacement of a closed polygon."""
    pts = np.asarray(points, dtype=np.float64)
    var = np.asarray(variance, dtype=np.float64)
    for _ in range(depth):
        a, b = pts, np.roll(pts, -1, axis=0)
        length = np.linalg.norm(b - a, axis=1, keepdims=True)
        vm = 0.5 * (var + np.roll(var, -1)) * rng.uniform(0.7, 1.3, size=var.shape)
        mid = 0.5 * (a + b) + rng.normal(0, 1, a.shape) * length * vm[:, None] * amount
        out = np.empty((2 * len(pts), 2))
        out[0::2], out[1::2] = a, mid
        ov = np.empty(2 * len(var))
        ov[0::2], ov[1::2] = var, vm
        pts, var = out, ov
    return pts, var


def ellipse(cx, cy, rx, ry, rotation=0.0, n=14):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    x, y = rx * np.cos(t), ry * np.sin(t)
    c, s = math.cos(rotation), math.sin(rotation)
    return np.stack([cx + c * x - s * y, cy + s * x + c * y], axis=1)


def rounded_rect(x0, y0, x1, y1, r, n_corner=4):
    pts = []
    corners = [(x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)]
    for cx, cy, start in corners:
        for k in range(n_corner + 1):
            a = math.radians(start + 90 * k / n_corner)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return np.array(pts)


def stroke_polygon(path, widths):
    """Turn a polyline into a closed outline with per-point half-widths."""
    path = np.asarray(path, dtype=np.float64)
    widths = np.broadcast_to(np.asarray(widths, dtype=np.float64), (len(path),))
    d = np.gradient(path, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    normal = np.stack([-d[:, 1], d[:, 0]], axis=1)
    left = path + normal * widths[:, None]
    right = path - normal * widths[:, None]
    return np.concatenate([left, right[::-1]], axis=0)


def blob(cx, cy, r, rng, n=10, wobble=0.25):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    rr = r * (1 + rng.uniform(-wobble, wobble, n))
    return np.stack([cx + rr * np.cos(t), cy + rr * np.sin(t)], axis=1)


# ---------------------------------------------------------------- canvas


class Canvas:
    def __init__(self, w, h, seed=1, paper_color='#ffffff', paper=None, tooth=2.4, texture=0.0):
        self.w, self.h = w, h
        self.rng = np.random.default_rng(seed)
        self.paper = paper or Paper(h, w, seed=seed + 101, tooth=tooth)
        base = srgb_to_linear(hex_rgb(paper_color))
        surface = 1.0 + texture * (self.paper.surface - 1.0)
        self.lin = np.clip(np.ones((h, w, 3), np.float32) * base * surface[..., None], 0, 1)
        self.coverage = np.zeros((h, w), np.float32)

    # -- density fields

    def wash_density(
        self,
        polygon,
        layers=40,
        variance=0.12,
        base_depth=3,
        layer_depth=3,
        amount=1.0,
        texture=0.35,
        texture_scale=180,
        layer_variance=None,
    ):
        """Accumulated density (about 0..1) of a Hobbs-style layered wash."""
        rng = self.rng
        poly = np.asarray(polygon, dtype=np.float64)
        var = np.full(len(poly), variance) * rng.uniform(0.6, 1.4, len(poly))
        base, bvar = deform(poly, var, base_depth, rng, amount)
        dens = np.zeros((self.h, self.w), np.float32)
        layer = np.zeros((self.h, self.w), np.uint8)
        lv = layer_variance if layer_variance is not None else 1.0
        # One blotchy mask per few layers keeps the coverage uneven, like real pigment.
        for i in range(layers):
            pts, _ = deform(base, bvar * lv, layer_depth, rng, amount)
            layer[:] = 0
            cv2.fillPoly(layer, [np.round(pts * 4).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=2)
            m = layer.astype(np.float32) / 255
            if texture > 0 and i % 3 == 0:
                noise = periodic_noise(self.h // 4 + 1, self.w // 4 + 1, rng, beta=2.0, high=4 / texture_scale)
                noise = cv2.resize(noise, (self.w, self.h), interpolation=cv2.INTER_CUBIC)
                tex = smoothstep(-0.6, 0.9, noise)
            if texture > 0:
                m *= (1 - texture) + texture * tex
            dens += m
        return dens / layers

    def stroke_density(self, path, widths, **kw):
        return self.wash_density(stroke_polygon(path, widths), **kw)

    # -- finishing a density field into paint

    def paint(
        self,
        density,
        color,
        strength=0.6,
        edge=1.0,
        edge_width=2.2,
        halo=0.25,
        granulation=0.12,
        soften=0.8,
        flow=0.22,
        flow_scale=6,
        blooms=0,
        bloom_size=(20, 60),
        hard=0.55,
        pool=0.0,
    ):
        """Finish a density field (dried edges, granulation, blooms) and glaze it on.

        `hard` mixes a wet-on-dry body (an even film with a crisp boundary) into
        the soft layered density, which keeps the feathered fringe of the layers.
        """
        rng = self.rng
        d = density.astype(np.float32)
        if soften > 0:
            d = cv2.GaussianBlur(d, (0, 0), soften)
        # Wet-on-dry body: where enough layers agree the paper was wet, the film is even.
        body = smoothstep(0.32, 0.5, d)
        d = (1 - hard) * d + hard * body * 0.85
        wet = smoothstep(0.03, 0.12, d)
        if blooms:
            bloom = np.zeros_like(d, dtype=np.uint8)
            inside = d > 0.5 * d.max()
            ys, xs = np.nonzero(inside)
            for _ in range(blooms if len(xs) else 0):
                k = rng.integers(len(xs))
                r = rng.uniform(*bloom_size)
                pts, _ = deform(blob(xs[k], ys[k], r, rng), np.full(10, 0.2), 4, rng)
                cv2.fillPoly(bloom, [np.round(pts * 4).astype(np.int32)], 255, cv2.LINE_AA, shift=2)
            b = cv2.GaussianBlur(bloom.astype(np.float32) / 255, (0, 0), 1.5)
            brim = np.clip(b - cv2.GaussianBlur(b, (0, 0), 3.0), 0, None)
            d = d * (1 - 0.5 * b) + 2.2 * brim * d
        # Pigment migrates to the boundary of the wet area as it dries.
        rim = np.clip(wet - cv2.GaussianBlur(wet, (0, 0), edge_width), 0, None)
        wide = np.clip(wet - cv2.GaussianBlur(wet, (0, 0), edge_width * 6), 0, None)
        d = d + edge * rim * (0.25 + d) * 2.0 + halo * wide * d
        # Low-frequency flow: the wash is never perfectly even.
        if flow:
            sh, sw = self.h // flow_scale + 1, self.w // flow_scale + 1
            f = cv2.resize(periodic_noise(sh, sw, rng, beta=3.0), (self.w, self.h), interpolation=cv2.INTER_CUBIC)
            d = d * (1 + flow * f)
        if pool:
            ys = np.linspace(-1, 1, self.h, dtype=np.float32)[:, None]
            d = d * (1 + pool * ys)
        # Granulating pigment settles into the paper's valleys.
        hgt = self.paper.height
        d = d * (1 + granulation * np.clip(-hgt, -1.5, 2.5))
        d = np.clip(d * strength, 0, 4)
        self.glaze(d, color)
        return d

    def glaze(self, d, color):
        col = srgb_to_linear(pigment(color) if isinstance(color, str) else color)
        k = -np.log(np.clip(col, 2e-3, 1.0))
        self.lin *= np.exp(-d[..., None] * k[None, None, :])
        self.coverage = np.maximum(self.coverage, np.clip(d, 0, 1))

    # -- line work

    def ink_line(self, path, width=2.0, color='#1d1a17', jitter=0.6, opacity=0.9, closed=False):
        """A slightly wavering drawn line, antialiased via supersampling."""
        rng = self.rng
        path = np.asarray(path, dtype=np.float64)
        if jitter:
            n = len(path)
            wob = cv2.GaussianBlur(rng.normal(0, jitter, (n, 2)).astype(np.float32), (1, 0), 3).reshape(n, 2)
            path = path + wob
        mask = np.zeros((self.h, self.w), np.uint8)
        cv2.polylines(
            mask, [np.round(path * 16).astype(np.int32)], closed, 255, max(1, int(round(width))), cv2.LINE_AA, shift=4
        )
        m = mask.astype(np.float32) / 255 * opacity
        col = srgb_to_linear(pigment(color))
        self.lin = self.lin * (1 - m[..., None]) + col[None, None, :] * m[..., None] * self.lin
        return m

    # -- output

    def rgb8(self):
        return (linear_to_srgb(self.lin) * 255 + 0.5).astype(np.uint8)

    def save(self, path, quality=86, scale=1.0):
        img = cv2.cvtColor(self.rgb8(), cv2.COLOR_RGB2BGR)
        if scale != 1.0:
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        params = [cv2.IMWRITE_WEBP_QUALITY, quality] if path.endswith('.webp') else []
        if path.endswith('.jpg'):
            params = [cv2.IMWRITE_JPEG_QUALITY, quality, cv2.IMWRITE_JPEG_PROGRESSIVE, 1]
        cv2.imwrite(path, img, params)


# ----------------------------------------------------------- conversions


def to_rgba_on_white(rgb8):
    """Colour-to-alpha against white: composited over white it looks identical,
    over off-white paper it behaves like a multiply glaze."""
    c = rgb8.astype(np.float32) / 255
    alpha = np.max(1 - c, axis=2)
    a = np.clip(alpha, 1e-4, 1)[..., None]
    col = (c - (1 - a)) / a
    out = np.concatenate([np.clip(col, 0, 1), alpha[..., None]], axis=2)
    return (out * 255 + 0.5).astype(np.uint8)


BAYER8 = (
    np.array(
        [
            [0, 32, 8, 40, 2, 34, 10, 42],
            [48, 16, 56, 24, 50, 18, 58, 26],
            [12, 44, 4, 36, 14, 46, 6, 38],
            [60, 28, 52, 20, 62, 30, 54, 22],
            [3, 35, 11, 43, 1, 33, 9, 41],
            [51, 19, 59, 27, 49, 17, 57, 25],
            [15, 47, 7, 39, 13, 45, 5, 37],
            [63, 31, 55, 23, 61, 29, 53, 21],
        ],
        dtype=np.float32,
    )
    + 0.5
) / 64


def palette_of(rgb8, k=8, seed=0):
    """The k dominant paint colours (paper excluded), via k-means."""
    px = rgb8.reshape(-1, 3).astype(np.float32)
    px = px[(1 - px.min(axis=1) / 255) > 0.12]
    if len(px) > 60000:
        px = px[np.random.default_rng(seed).choice(len(px), 60000, replace=False)]
    lab = cv2.cvtColor(px.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5)
    cv2.setRNGSeed(seed)  # k-means draws from OpenCV's global RNG; pin it
    _, _, centers = cv2.kmeans(lab, k, None, crit, 4, cv2.KMEANS_PP_CENTERS)
    return cv2.cvtColor(centers.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_LAB2RGB).reshape(-1, 3)


def pixel_dissolve(rgb8, cell, field, gap=1, paper=(255, 255, 255), palette=None, scatter=None, reach=3.5, seed=0):
    """Resolve an image into flat, posterised cells wherever `field` (0..1 per
    pixel) beats an ordered-dither threshold, leaving a hairline of paper
    between cells. `scatter` (0..1 per pixel) lets a few cells break away past
    the painted edge, coloured like the nearest paint."""
    h, w = rgb8.shape[:2]
    gh, gw = h // cell, w // cell
    region = rgb8[: gh * cell, : gw * cell]
    small = cv2.resize(region, (gw, gh), interpolation=cv2.INTER_AREA).astype(np.float32)
    f = cv2.resize(field.astype(np.float32)[: gh * cell, : gw * cell], (gw, gh), interpolation=cv2.INTER_AREA)
    yy, xx = np.mgrid[0:gh, 0:gw]
    threshold = BAYER8[yy % 8, xx % 8]
    paper_f = np.array(paper, np.float32)
    ink = 1 - small.min(axis=2) / 255  # how much paint a cell holds
    on = (f > threshold) & (ink > 0.06)
    if scatter is not None:
        # Spread colour outward so breakaway cells inherit nearby paint.
        filled = small.copy()
        painted = (ink > 0.06).astype(np.uint8)
        dist, labels = cv2.distanceTransformWithLabels(1 - painted, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        ys, xs = np.nonzero(painted)
        if len(ys):
            lut = np.zeros((labels.max() + 1, 2), np.int64)
            lut[labels[ys, xs]] = np.stack([ys, xs], 1)
            src = lut[labels]
            filled = small[src[..., 0], src[..., 1]]
        s = cv2.resize(scatter.astype(np.float32)[: gh * cell, : gw * cell], (gw, gh), interpolation=cv2.INTER_AREA)
        rng = np.random.default_rng(seed)
        away = (ink <= 0.06) & (rng.random((gh, gw)) < s * np.exp(-dist / reach))
        small = np.where(away[..., None], filled, small)
        on |= away
    # Snap each cell to the painting's own palette: flat, clearly digital colour.
    if palette is None:
        palette = palette_of(rgb8, seed=seed)
    pal_lab = cv2.cvtColor(np.asarray(palette, np.uint8).reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    cell_lab = cv2.cvtColor(small.astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    # Hue matters more than lightness: a pale rose cell must stay rose.
    wts = np.array([1.0, 2.5, 2.5], np.float32)
    idx = np.argmin((((cell_lab[:, :, None, :] - pal_lab[None, None]) * wts) ** 2).sum(-1), axis=2)
    q = np.asarray(palette, np.uint8)[idx]
    big = cv2.resize(q, (gw * cell, gh * cell), interpolation=cv2.INTER_NEAREST)
    sel = cv2.resize(on.astype(np.uint8), (gw * cell, gh * cell), interpolation=cv2.INTER_NEAREST).astype(bool)
    grid = np.zeros((gh * cell, gw * cell), bool)
    for g in range(gap):
        grid[g::cell, :] = True
        grid[:, g::cell] = True
    out = rgb8.copy()
    view = out[: gh * cell, : gw * cell]
    view[sel] = big[sel]
    view[sel & grid] = paper_f.astype(np.uint8)
    return out
