import { useEffect, useMemo, useState, type CSSProperties } from 'react';

// Background and accents are intentionally separate: cream artwork should not
// become a red interface merely because its few coloured details are red.
export type AppearanceMode = 'auto' | 'light' | 'dark';
export type RGB = { r: number; g: number; b: number };
export type Palette = {
  background: RGB;
  accent: RGB | null;
  secondary: RGB | null;
  light: boolean;
};
type HSL = { hue: number; saturation: number; lightness: number };
type Bucket = { weight: number; count: number; r: number; g: number; b: number };
const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });
const fallback: Palette = {
  background: rgb(29, 19, 37), accent: rgb(160, 112, 208),
  secondary: null, light: false
};
const palettes = new Map<string, Promise<Palette>>();
const blobs = new WeakMap<Blob, Promise<Palette>>();

function hsl({ r, g, b }: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), delta = hi - lo;
  const lightness = (hi + lo) / 2;
  if (!delta) return { hue: 0, saturation: 0, lightness };
  const hue = (hi === r ? (g - b) / delta : hi === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60;
  return { hue: (hue + 360) % 360, saturation: delta / (1 - Math.abs(2 * lightness - 1)), lightness };
}
function fromHsl(hue: number, saturation: number, lightness: number): RGB {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return rgb(channel(0), channel(8), channel(4));
}
function mix(a: RGB, b: RGB, portion: number): RGB {
  return rgb(
    Math.round(a.r * (1 - portion) + b.r * portion),
    Math.round(a.g * (1 - portion) + b.g * portion),
    Math.round(a.b * (1 - portion) + b.b * portion)
  );
}
const format = (c: RGB) => 'rgb(' + c.r + ' ' + c.g + ' ' + c.b + ')';
const distance = (a: RGB, b: RGB) =>
  Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) / (255 * Math.sqrt(3));
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
function luminance(colour: RGB): number {
  const channel = (n: number) => {
    const s = n / 255;
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  };
  return .2126 * channel(colour.r) + .7152 * channel(colour.g) + .0722 * channel(colour.b);
}
function contrast(a: RGB, b: RGB): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

export function paletteFromPixels(pixels: Uint8ClampedArray, width = 64, height = 64): Palette {
  const buckets = new Map<number, Bucket>();
  let visible = 0, bright = 0;
  const pixelCount = Math.floor(pixels.length / 4);
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    if (pixels[i + 3] < 128) continue;
    const colour = rgb(pixels[i], pixels[i + 1], pixels[i + 2]);
    const col = p % width, row = Math.floor(p / width);
    // Slightly favour artwork edges, which usually reveal the canvas colour.
    const edge = col < width * .14 || col >= width * .86 ||
      row < height * .14 || row >= height * .86;
    const weight = edge ? 1.45 : 1;
    const key = ((colour.r >> 4) << 8) | ((colour.g >> 4) << 4) | (colour.b >> 4);
    const bucket = buckets.get(key) || { weight: 0, count: 0, r: 0, g: 0, b: 0 };
    bucket.weight += weight;
    bucket.count++;
    bucket.r += colour.r; bucket.g += colour.g; bucket.b += colour.b;
    buckets.set(key, bucket);
    visible++;
    if (hsl(colour).lightness >= .72) bright++;
  }
  if (!visible) return fallback;
  const entries = [...buckets.values()].map(bucket => {
    const colour = rgb(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count);
    return { ...bucket, colour, tone: hsl(colour) };
  });
  entries.sort((a, b) => b.weight - a.weight);
  const dominant = entries[0];
  const background = rgb(
    Math.round(dominant.colour.r), Math.round(dominant.colour.g), Math.round(dominant.colour.b)
  );
  // Require BOTH a bright dominant background and a majority of light pixels:
  // prevents a light logo on black artwork from turning the entire app white.
  const light = dominant.tone.lightness >= .71 && bright / visible >= .55;

  // Pick artwork detail colours independently from the canvas background.
  // Low-frequency but saturated illustrations remain eligible.
  const candidates = entries.filter(entry =>
    entry.count >= Math.max(3, visible * .001) &&
    entry.tone.saturation >= .17 &&
    entry.tone.lightness >= .09 && entry.tone.lightness <= .90 &&
    distance(entry.colour, background) >= .13
  ).map(entry => ({
    ...entry,
    score: entry.weight * (.38 + entry.tone.saturation * 1.3) *
      (.55 + distance(entry.colour, background))
  })).sort((a, b) => b.score - a.score);
  const first = candidates[0] || null;
  const second = candidates.find(entry => first &&
    hueDistance(entry.tone.hue, first.tone.hue) >= 38 &&
    entry.count >= Math.max(4, visible * .002)) || null;
  return { background, accent: first?.colour || null, secondary: second?.colour || null, light };
}

async function extract(blob: Blob): Promise<Palette> {
  const bitmap = await createImageBitmap(blob, { resizeWidth: 64, resizeHeight: 64, resizeQuality: 'high' });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.drawImage(bitmap, 0, 0, 64, 64);
    return paletteFromPixels(ctx.getImageData(0, 0, 64, 64).data);
  } finally { bitmap.close(); }
}

async function cachedPalette(blob: Blob): Promise<Palette> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const cached = palettes.get(key);
  if (cached) return cached;
  const pending = extract(blob).catch(() => fallback);
  palettes.set(key, pending);
  if (palettes.size > 64) palettes.delete(palettes.keys().next().value!);
  return pending;
}

export function themeVariables(palette: Palette, mode: AppearanceMode = 'auto'): CSSProperties {
  const artworkBase = palette.background;
  const artworkTone = hsl(artworkBase);
  const light = mode === 'auto' ? palette.light : mode === 'light';
  // Forced modes preserve the original artwork hue and detail accents, while
  // lifting black artwork or deepening cream artwork into the requested range.
  // Very dark backgrounds may have a misleading saturated hue from tiny
  // RGB differences (e.g. near-black 8,7,9 looks purple mathematically).
  // Use the actual illustrated accent instead of tinting Light mode purple.
  const sourceTone = artworkTone.saturation >= .18 && artworkTone.lightness >= .12
    ? artworkTone : hsl(palette.accent || fallback.accent!);
  const base = light && !palette.light
    ? fromHsl(sourceTone.hue, Math.min(.67, Math.max(.42, sourceTone.saturation * .72)), .86)
    : !light && palette.light
      ? fromHsl(sourceTone.hue, Math.min(.38, Math.max(.17, sourceTone.saturation * .42)), .19)
      : artworkBase;
  const tone = hsl(base);
  const darkBase = tone.lightness > .55 ? mix(base, rgb(30, 29, 35), .70) : base;
  const primaryArtwork = palette.accent ? hsl(palette.accent) :
    tone.saturation >= .12 ? tone : hsl(fallback.accent!);
  const secondArtwork = palette.secondary ? hsl(palette.secondary) : null;
  const neutralArt = !palette.accent && tone.saturation < .12;
  // For pale coloured covers, a deep version of the cover's canvas hue is the
  // primary control colour. Their illustration becomes the secondary accent.
  const canvasAccent = light && palette.light && tone.saturation >= .12;
  const primaryHue = canvasAccent ? tone.hue - (tone.hue >= 25 && tone.hue <= 90 ? 14 : 0) : primaryArtwork.hue;
  const saturation = neutralArt ? 0 : canvasAccent ? .65 : Math.max(.46, primaryArtwork.saturation);
  // Each light surface is a purposeful shade of the artwork instead of an
  // almost-white blend. The sidebar, content canvas and player remain distinct.
  const lightHue = neutralArt ? 0 : palette.light && artworkTone.saturation >= .1
    ? artworkTone.hue : sourceTone.hue;
  const lightSaturation = neutralArt ? 0 :
    Math.min(.72, Math.max(.43, sourceTone.saturation * .76));
  const lightShade = (level: number, saturationScale = 1) =>
    fromHsl(lightHue, Math.min(.8, lightSaturation * saturationScale), level);
  const lightSurface = {
    bg: lightShade(.89, .92),
    sidebar: lightShade(.80, .88),
    panel: lightShade(.95, .68),
    raised: lightShade(.84, .86),
    hover: lightShade(.78, .92),
    selected: lightShade(.75, .98),
    border: lightShade(.64, .51)
  };
  // Adjust colour strength for the artwork's particular hue and surface
  // luminance. Bright green, for example, needs to be deeper than red on ivory.
  const surfaceColours = (candidate: RGB): RGB[] => light ? [
    lightSurface.bg, lightSurface.sidebar, lightSurface.panel,
    lightSurface.raised, lightSurface.hover, lightSurface.selected
  ] : [
    mix(darkBase, rgb(16, 15, 19), .82),
    mix(darkBase, rgb(12, 11, 15), .88),
    mix(darkBase, rgb(31, 28, 35), .76),
    mix(darkBase, rgb(45, 39, 48), .77),
    mix(darkBase, rgb(61, 52, 65), .71),
    mix(mix(darkBase, rgb(23, 21, 27), .70), candidate, .10)
  ];
  const onPrimary = light ? rgb(255, 252, 245) : rgb(28, 23, 30);
  let level = light ? .28 : .76;
  let primary = fromHsl(primaryHue, Math.min(.8, saturation), level);
  for (let tries = 0; tries < 40; tries++) {
    if (surfaceColours(primary).every(surface => contrast(primary, surface) >= 4.5) &&
        contrast(primary, onPrimary) >= 4.5) break;
    level = Math.max(.055, Math.min(.94, level + (light ? -.01 : .01)));
    primary = fromHsl(primaryHue, Math.min(.8, saturation), level);
  }
  const primaryHover = fromHsl(primaryHue, Math.min(.8, saturation),
    light ? Math.max(.055, level - .07) : Math.min(.94, level + .09));
  const secondaryArt = canvasAccent ? (palette.accent ? hsl(palette.accent) : null) : secondArtwork;
  let secondary = primary;
  if (secondaryArt) {
    let secondaryLevel = light ? .35 : .74;
    const sat = Math.min(.77, Math.max(.48, secondaryArt.saturation));
    secondary = fromHsl(secondaryArt.hue, sat, secondaryLevel);
    for (let tries = 0; tries < 40; tries++) {
      if (surfaceColours(primary).slice(0, 4).every(surface => contrast(secondary, surface) >= 4.5)) break;
      secondaryLevel = Math.max(.055, Math.min(.94, secondaryLevel + (light ? -.01 : .01)));
      secondary = fromHsl(secondaryArt.hue, sat, secondaryLevel);
    }
  }
  // Muted labels need a stronger tint on highly saturated covers than on
  // pale cream artwork. Keep them readable without unnecessarily darkening all.
  let muted = light ? rgb(94, 83, 73) : rgb(193, 184, 197);
  for (let tries = 0; tries < 30; tries++) {
    if (surfaceColours(primary).every(surface => contrast(muted, surface) >= 4.5)) break;
    muted = mix(muted, light ? rgb(20, 18, 17) : rgb(255, 255, 255), .12);
  }
  const values: Record<string, string> = light ? {
    '--theme-bg': format(lightSurface.bg),
    '--theme-sidebar': format(lightSurface.sidebar),
    '--theme-panel': format(lightSurface.panel),
    '--theme-raised': format(lightSurface.raised),
    '--theme-hover': format(lightSurface.hover),
    '--theme-selected': format(lightSurface.selected),
    '--theme-border': format(lightSurface.border),
    '--theme-text': 'rgb(35 30 26)',
    '--theme-muted': format(muted),
    '--theme-on-accent': 'rgb(255 252 245)'
  } : {
    '--theme-bg': format(mix(darkBase, rgb(16, 15, 19), .82)),
    '--theme-sidebar': format(mix(darkBase, rgb(12, 11, 15), .88)),
    '--theme-panel': format(mix(darkBase, rgb(31, 28, 35), .76)),
    '--theme-raised': format(mix(darkBase, rgb(45, 39, 48), .77)),
    '--theme-hover': format(mix(darkBase, rgb(61, 52, 65), .71)),
    '--theme-selected': format(mix(mix(darkBase, rgb(23, 21, 27), .70), primary, .10)),
    '--theme-border': format(mix(darkBase, rgb(115, 105, 115), .40)),
    '--theme-text': 'rgb(248 245 249)',
    '--theme-muted': format(muted),
    '--theme-on-accent': 'rgb(28 23 30)'
  };
  values['--theme-accent'] = format(primary);
  values['--theme-accent-hover'] = format(primaryHover);
  values['--theme-secondary'] = format(secondary);
  return { ...values, colorScheme: light ? 'light' : 'dark' } as CSSProperties;
}

export function useArtworkTheme(cover?: Blob, mode: AppearanceMode = 'auto'): CSSProperties {
  const [palette, setPalette] = useState(fallback);
  useEffect(() => {
    let active = true;
    if (!cover) { setPalette(fallback); return; }
    let pending = blobs.get(cover);
    if (!pending) {
      pending = cachedPalette(cover).catch(() => fallback);
      blobs.set(cover, pending);
    }
    void pending.then(result => { if (active) setPalette(result); });
    // A slow decode from a skipped track must not override the current track.
    return () => { active = false; };
  }, [cover]);
  return useMemo(() => themeVariables(palette, mode), [palette, mode]);
}
