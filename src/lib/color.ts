/** "#AE4A1D" -> "174 74 29" (the channel format the CSS color variables use). */
export function hexToRgbChannels(hex: string): string | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const n = parseInt(match[1]!, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

/**
 * A brand accent is used both as a button background (white text) and as
 * text on the warm off-white page, so it must reach 4.5:1 against both.
 */
export function isAccessibleAccent(hex: string): boolean {
  return contrastRatio(hex, "#FFFFFF") >= 4.5 && contrastRatio(hex, "#FAF6F0") >= 4.5;
}
