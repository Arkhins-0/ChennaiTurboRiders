import type { Config } from "tailwindcss";

/** A console colour: a CSS variable holding "r g b", so `/opacity` still works. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

/**
 * Dark, card-led palette.
 *
 * The layout is the same one the design reference uses — a page colour showing
 * around one big rounded card — but inverted: the page is near-black and the
 * card sits a shade above it. Depth comes from those two steps plus `panel` for
 * anything nested inside the card, never from shadows, which do not read on a
 * dark background.
 *
 * `accent` is the one bright colour, and it carries every primary button, badge
 * and the call-to-action band. `accent-ink` is the only thing that may sit ON
 * accent — near-black, because yellow needs dark type over it.
 *
 * The second block of colours is the CONSOLE's, and it is a different design
 * altogether: a light workspace — white pages, a grey sidebar, one violet
 * accent — that follows the OS into dark mode. See the block itself.
 *
 * The two sets never mix. Site components use page/surface/panel/accent; admin
 * components use background/card/muted/primary. Anything using both would look
 * like neither.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    /*
     * Every colour as a shadow colour, except `card`: `shadow-card` is the
     * console's card shadow (boxShadow below), and with `card` also a shadow
     * colour the same class would emit both and tint the shadow white.
     */
    boxShadowColor: ({ theme }) => {
      const { card: _card, ...colors } = theme("colors") as Record<string, unknown>;
      return colors as Record<string, string>;
    },
    extend: {
      colors: {
        accent: {
          DEFAULT: "#F7D619",
          dark: "#E0BF06",
          ink: "#0A0A0A",
        },
        // Surfaces, darkest first. The steps between them are deliberately
        // wide: on a dark page a 2-3% difference reads as one flat expanse, so
        // each level is far enough apart to be told apart at a glance.
        page: "#000000",
        surface: "#0C0E11",
        panel: "#1B2027",
        line: "#39414D",
        // Type. `muted` and `faint` are both well clear of the 4.5:1 floor
        // against `panel`, which is the darkest thing they ever sit on.
        fg: {
          DEFAULT: "#FFFFFF",
          muted: "#C2C9D4",
          faint: "#98A1AF",
        },

        /* ─────────────────────────── Admin only ───────────────────────────
           The console's look is a workspace's: white pages, a quiet grey
           sidebar (`rail`), hairline borders, near-black type in three weights
           of grey (foreground, muted-fg, faint) and one violet accent
           (`primary`). Each name is a CSS variable set in
           src/styles/globals.css — a light set, and a dark set under
           `prefers-color-scheme: dark` — written as "r g b" so the opacity
           modifiers (`bg-primary/10`, `ring-ring/40`) keep working. The NAMES
           are the ones every console screen already used, so the screens take
           the palette without being rewritten. */
        background: v("c-bg"),
        foreground: v("c-fg"),
        card: { DEFAULT: v("c-card"), fg: v("c-fg") },
        // Hover states, selected rows, anything deliberately receding.
        muted: { DEFAULT: v("c-high"), fg: v("c-soft") },
        // The accent: the action that writes, the open page, focus.
        primary: { DEFAULT: v("c-primary"), deep: v("c-primary-deep"), fg: v("c-on-primary") },
        secondary: { DEFAULT: v("c-high"), fg: v("c-fg") },
        destructive: v("c-danger"),
        border: v("c-line"),
        input: v("c-input"),
        ring: v("c-primary"),
        // The sidebar's grey, a raised surface, and the quietest text.
        rail: v("c-rail"),
        high: v("c-high"),
        faint: v("c-faint"),
        ok: { bg: "rgb(34 197 94 / 0.14)", fg: v("c-ok") },
        warn: { bg: "rgb(234 179 8 / 0.14)", line: "rgb(234 179 8 / 0.45)", fg: v("c-warn") },
        /* ──────────────────────── Chennai Turbo Riders ────────────────────
           The F4 site's own palette: racing yellow on carbon black. It
           overlaps `accent` by value and not by name on purpose — the site
           components name the brand, the shared components name the role, and
           renaming either would mean editing the other. */
        "racing-yellow": {
          DEFAULT: "#F7D619",
          dark: "#D4BB0A",
        },
        carbon: {
          100: "#F5F5F5",
          200: "#E5E5E5",
          300: "#8A8F99",
          400: "#5C616B",
          500: "#404040",
          600: "#2D2D2D",
          700: "#222222",
          800: "#161616",
          900: "#0E0E0E",
          950: "#070707",
        },
        metal: {
          DEFAULT: "#8A8A8A",
          light: "#C0C0C0",
        },
      },
      fontFamily: {
        // Supplied by next/font in src/app/layout.tsx.
        // `display` is Rajdhani — the site's headline face.
        display: ["var(--font-display)", "Oswald", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        // The site's data face: readouts, labels, timestamps — the broadcast
        // graphics of a race weekend.
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        // The console's face: Inter, the same `--font-body` the site loads, set
        // at the tool's own sizes (13-14px) with Inter's alternate glyphs on.
        ui: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      // The console's: a whisper of a shadow on cards, a real one on anything
      // that floats (the jump palette, dialogs, toasts, the phone's drawer).
      boxShadow: {
        card: "0 1px 2px rgb(16 24 40 / 0.04)",
        pop: "0 12px 32px -8px rgb(16 24 40 / 0.18), 0 2px 6px rgb(16 24 40 / 0.06)",
      },
      borderRadius: {
        card: "28px",
        panel: "22px",
      },
      animation: {
        float: "float 4s ease-in-out infinite",
        // The strip renders its items twice, so travelling exactly half the
        // track puts the copy back where the original started — seamless.
        marquee: "marquee 34s linear infinite",
        "marquee-slow": "marquee 60s linear infinite",
        "marquee-reverse": "marquee-reverse 60s linear infinite",
        blink: "blink 1.6s steps(2, start) infinite",
        scan: "scan 9s linear infinite",
        "spin-slow": "spin 14s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          from: { transform: "translateX(-50%)" },
          to: { transform: "translateX(0)" },
        },
        blink: {
          to: { visibility: "hidden" },
        },
        scan: {
          from: { transform: "translateY(-100%)" },
          to: { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
