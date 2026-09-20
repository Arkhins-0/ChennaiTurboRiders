/**
 * Which of black and white can be read on a colour.
 *
 * One function, because there is one place in this project where a colour is
 * TYPED rather than taken from the palette: the announcement card on /incrc,
 * whose whole point is that whoever writes it names the colour. Everywhere else
 * the pairing is decided in the design and the tailwind config says so —
 * `accent-ink` on `accent`, `fg` on `panel` — and none of it needs measuring.
 *
 * WCAG relative luminance, which is NOT "how bright does that look". It weights
 * green far above blue, so pure yellow comes out light and takes black type
 * while pure blue comes out dark and takes white — which is what the eye
 * expects and what an average of the three channels gets backwards.
 *
 * Shared by the server and the browser, so nothing here may import `server-only`.
 */

/** One sRGB channel, undone back to linear light. */
function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/**
 * The point where black and white are equally readable on a colour.
 *
 * Not 0.5. Contrast against white is `1.05 / (L + 0.05)` and against black is
 * `(L + 0.05) / 0.05`; setting them equal gives `L = √0.0525 − 0.05`. Half way
 * up the luminance scale is the intuitive answer and the wrong one — it puts
 * white type on a mid grey, where black is the more legible of the two.
 */
const CROSSOVER = Math.sqrt(0.0525) - 0.05;

/**
 * `"#RRGGBB"` → which INK to use, not which background: `dark` means near-black
 * type, which is what a light card wants.
 *
 * Anything that is not a six-digit hex reads as `dark`. Callers put the value
 * through `hexColour` first, so reaching here with something else means the
 * colour is the fallback — and the fallback is the accent yellow, which takes
 * black.
 */
export function readableInk(hex: string): "dark" | "light" {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "dark";

  const value = parseInt(match[1], 16);
  const luminance =
    0.2126 * channel((value >> 16) & 0xff) +
    0.7152 * channel((value >> 8) & 0xff) +
    0.0722 * channel(value & 0xff);

  return luminance > CROSSOVER ? "dark" : "light";
}
