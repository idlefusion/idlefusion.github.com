"""Night versions of the watercolour art, for the site's dark theme.

    python3 scripts/watercolor/night.py                    # everything
    python3 scripts/watercolor/night.py hero-fusion paper  # just some

By day every painting is rendered on white and glazes onto the paper with
`mix-blend-mode: multiply`. On dark paper multiply would swallow it, so each
night version is derived from its daytime file: Beer-Lambert gives back how
much paint is where (optical density, per channel), and each pigment is then
shown as it looks at an even lightness, with its coverage taken from the
amount of paint. The result is painted on black and shown with
`mix-blend-mode: screen`, so thin washes stay faint, dried edges and
granulation still read, the hues match the daytime pigments, and ink
linework turns to chalk. Output goes to public/img/paint/night/.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from engine import Paper, hex_rgb, linear_to_srgb, smoothstep, srgb_to_linear, to_rgba_on_white  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'public/img/paint'
OUT = SRC / 'night'

# Night paper: a warm near-black, the daytime ink.
NIGHT_PAPER = '#181613'

_M1 = np.array(
    [[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]],
    np.float32,
)
_M2 = np.array(
    [[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]],
    np.float32,
)
_M2_INV = np.linalg.inv(_M2).astype(np.float32)
_M1_INV = np.linalg.inv(_M1).astype(np.float32)


def to_oklab(lin):
    return np.cbrt(np.maximum(lin @ _M1.T, 0)) @ _M2.T


def from_oklab(lab):
    return ((lab @ _M2_INV.T) ** 3) @ _M1_INV.T


def lightness(lin):
    return to_oklab(lin)[..., 0]


def night_layer(rgb8, lightness_target=0.62, coverage=0.6, detail=0.035, chroma_floor=0.085, saturation=1.0, chalk=0.86):
    """Colour (sRGB, 0..1) and coverage (0..1) of a daytime painting's paint."""
    lin = srgb_to_linear(rgb8.astype(np.float32) / 255)
    density = -np.log(np.clip(lin, 1e-3, 1))
    amount = np.linalg.norm(density, axis=2)
    direction = density / np.maximum(amount, 1e-6)[..., None]
    # Dried edges and granulation carry more paint than the wash around them;
    # let them glow a little brighter, the way they read darker by day.
    target = lightness_target + detail * np.tanh(2 * (amount - cv2.GaussianBlur(amount, (0, 0), 6)))
    # Each pigment at the density where it reaches the target lightness.
    lo, hi = np.zeros_like(amount), np.full_like(amount, 12.0)
    for _ in range(20):
        mid = (lo + hi) / 2
        too_light = lightness(np.exp(-direction * mid[..., None])) > target
        lo, hi = np.where(too_light, mid, lo), np.where(too_light, hi, mid)
    lab = to_oklab(np.exp(-direction * ((lo + hi) / 2)[..., None]))
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    # Neutral ink (outlines, measurements) turns to chalk.
    ink = 1 - smoothstep(0.012, 0.03, chroma)
    lab[..., 0] = lab[..., 0] * (1 - ink) + chalk * ink
    lab[..., 1:] *= saturation
    if chroma_floor:
        # Glazes of two pigments sit close to grey; keep their violet.
        chroma = np.hypot(lab[..., 1], lab[..., 2])
        want = np.maximum(chroma, chroma_floor * (1 - ink) * smoothstep(0.2, 0.8, amount))
        lab[..., 1:] *= (want / np.maximum(chroma, 1e-6))[..., None]
    # Pull chroma in until every colour fits sRGB.
    for _ in range(16):
        rgb = from_oklab(lab)
        outside = ((rgb < -1e-4) | (rgb > 1 + 1e-4)).any(-1)
        if not outside.any():
            break
        lab[..., 1:][outside] *= 0.92
    colour = linear_to_srgb(np.clip(from_oklab(lab), 0, 1))
    alpha = 1 - np.exp(-amount * coverage)
    return colour, alpha


def deep_layer(rgb8, lift=1.45):
    """A deep wash keeps its daytime colour and texture, as the same paint on
    dark paper would, lifted a little in lightness so the pool still reads."""
    day = to_rgba_on_white(rgb8).astype(np.float32) / 255
    lab = to_oklab(srgb_to_linear(day[..., :3]))
    lab[..., 0] = np.clip(lab[..., 0] * lift, 0, 1)
    for _ in range(16):
        rgb = from_oklab(lab)
        outside = ((rgb < -1e-4) | (rgb > 1 + 1e-4)).any(-1)
        if not outside.any():
            break
        lab[..., 1:][outside] *= 0.92
    # Pale fringes that run off the canvas glow at night; feather them out
    # before they meet the image's edge.
    h, w = rgb8.shape[:2]
    edge = min(h, w) * 0.06
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    border = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy))
    return linear_to_srgb(np.clip(from_oklab(lab), 0, 1)), day[..., 3] * smoothstep(0, edge, border)


def on_black(colour, alpha):
    return (np.clip(colour * alpha[..., None], 0, 1) * 255 + 0.5).astype(np.uint8)


def rgba(colour, alpha):
    out = np.concatenate([colour, alpha[..., None]], axis=2)
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


def read(name):
    img = cv2.imread(str(SRC / f'{name}.webp'), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise SystemExit(f'missing {name}.webp')
    if img.shape[2] == 4:
        # Colour-to-alpha files: put them back on white first.
        rgb = cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA).astype(np.float32) / 255
        a = rgb[..., 3:]
        return (np.clip(rgb[..., :3] * a + (1 - a), 0, 1) * 255 + 0.5).astype(np.uint8)
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def write(img, name, quality):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'{name}.webp'
    code = cv2.COLOR_RGBA2BGRA if img.shape[2] == 4 else cv2.COLOR_RGB2BGR
    cv2.imwrite(str(path), cv2.cvtColor(img, code), [cv2.IMWRITE_WEBP_QUALITY, quality])
    print(f'  night/{name}.webp: {img.shape[1]}x{img.shape[0]}, {path.stat().st_size // 1024} KB')


# ------------------------------------------------------------------ assets


def painting(name, quality=82, **kw):
    return lambda: write(on_black(*night_layer(read(name), **kw)), name, quality)


def deep(name):
    """The closing call-to-action field stays a deep pool, so white type still
    reads on it at night."""
    return lambda: write(on_black(*deep_layer(read(name))), name, 78)


def swatch(name):
    """Highlighter strokes sit under light text at night: darker, and RGBA so
    they need no blend mode on the text itself."""
    return lambda: write(rgba(*night_layer(read(name), lightness_target=0.52, coverage=1.3, detail=0.02, chroma_floor=0)), name, 80)


def app_swatch():
    """The app highlighter is a grey stroke on white tinted by blending; at
    night it is the same stroke in white on black."""
    write(255 - read('app-swatch'), 'app-swatch', 80)


def paper():
    """The daytime paper's tooth (same seed), lit low across a dark sheet."""
    p = Paper(640, 640, seed=900, tooth=2.0, strength=0.9)
    # Scaled in sRGB so the tooth reads about as strongly as it does by day.
    srgb = hex_rgb(NIGHT_PAPER)[None, None, :] * (1 + 3.6 * (p.surface[..., None] - 1.0))
    write((np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8), 'paper', 85)


ASSETS = {
    'hero-fusion': painting('hero-fusion'),
    'cta-wash': deep('cta-wash'),
    'cta-wash-tall': deep('cta-wash-tall'),
    **{name: painting(name) for name in ('service-mobile', 'service-web', 'service-direction')},
    **{f'step-{i}': painting(f'step-{i}') for i in (1, 2, 3)},
    **{
        f'work-{slug}': painting(f'work-{slug}')
        for slug in ('everybody-everywhere', 'radio-disney', 'golf-channel-academy', 'easy-digital-downloads', 'golf-channel')
    },
    **{f'swatch-{c}': swatch(f'swatch-{c}') for c in ('rose', 'cerulean', 'ochre')},
    'app-swatch': app_swatch,
    'paper': paper,
}

if __name__ == '__main__':
    for name in sys.argv[1:] or list(ASSETS):
        ASSETS[name]()
