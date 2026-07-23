function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/** WCAG 2.x contrast ratio between two hex colors, in the range [1, 21]. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Alpha-composites `hexFg` (at `alpha`, 0–1) over `hexBg` and returns the
 * resulting opaque hex color. Mirrors how a browser renders a CSS
 * `opacity-NN` utility on plain (no explicit color class) foreground text:
 * a straight per-channel linear interpolation of the two colors' sRGB byte
 * values — the same non-linear space the bytes are already encoded in, not
 * the physically-linear space `relativeLuminance` converts into. Used to
 * regression-test that opacity-based "muted text" tricks still clear WCAG
 * AA against the actual rendered (blended) color, not just the raw token.
 */
export function blendHex(hexFg: string, hexBg: string, alpha: number): string {
  const fg = hexFg.replace("#", "");
  const bg = hexBg.replace("#", "");
  const blendChannel = (start: number) => {
    const f = parseInt(fg.slice(start, start + 2), 16);
    const b = parseInt(bg.slice(start, start + 2), 16);
    return Math.round(f * alpha + b * (1 - alpha));
  };
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(blendChannel(0))}${toHex(blendChannel(2))}${toHex(blendChannel(4))}`;
}
