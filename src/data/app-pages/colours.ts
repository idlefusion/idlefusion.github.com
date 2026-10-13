// Colours derived from an app's pigments, worked out at build time in OKLab so
// the hue stays the app's own. At night pigments are screened onto the dark
// paper, so a dark pigment (Rest Easy's navy) would barely show: each is
// brought to a lightness where it glows like the night paintings, and ink is
// lightened until it reads as text on the night paper. By day, the highlighter
// under a headline word is lightened just enough for ink to read on it.

type Vec = [number, number, number];

const NIGHT_PAPER = '#181613';
const INK = '#171512';

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function parse(hex: string): Vec {
  const v = hex.replace('#', '');
  return [0, 2, 4].map((i) => toLinear(parseInt(v.slice(i, i + 2), 16) / 255)) as Vec;
}

function format(rgb: Vec): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function toOklab([r, g, b]: Vec): Vec {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Vec): Vec {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** The colour at lightness L with the same hue, chroma pulled in to fit sRGB. */
function atLightness([, a, b]: Vec, L: number): Vec {
  for (let k = 1; k > 0.02; k *= 0.95) {
    const rgb = fromOklab([L, a * k, b * k]);
    if (rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4)) return rgb;
  }
  return fromOklab([L, 0, 0]);
}

const luminance = ([r, g, b]: Vec) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const contrast = (a: Vec, b: Vec) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The first colour, lightening the pigment step by step, that reads 4.6:1 against `against`. */
function lightenUntilReadable(hex: string, against: string): string {
  const lab = toOklab(parse(hex));
  for (let L = lab[0]; L <= 1; L += 0.01) {
    const rgb = atLightness(lab, L);
    if (contrast(rgb, parse(against)) >= 4.6) return L === lab[0] ? hex : format(rgb);
  }
  return '#ffffff';
}

/** A pigment that glows on the night paper: lightness held between 0.64 and 0.8. */
export function nightPigment(hex: string): string {
  const lab = toOklab(parse(hex));
  return format(atLightness(lab, Math.min(0.8, Math.max(0.64, lab[0]))));
}

/** The pigment as text on the night paper, at 4.5:1 or better. */
export function nightInk(hex: string): string {
  return lightenUntilReadable(hex, NIGHT_PAPER);
}

/** The daytime highlighter: the pigment, lightened only if ink would not read on it. */
export function dayHighlight(hex: string): string {
  return lightenUntilReadable(hex, INK);
}
