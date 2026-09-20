import type { Config } from "tailwindcss";

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
 * The second block of colours is the ADMIN's, and it is a different design
 * altogether: a monochrome tool palette in the manner of Reactive Resume, where
 * depth is one step of grey at a time and the absence of colour is the point.
 * Two exceptions, both meaningful: `primary` is CTR's yellow so the one action
 * that writes to the database is unmistakable, and `destructive` is red.
 *
 * The two sets never mix. Site components use page/surface/panel/accent; admin
 * components use background/card/muted/primary. Anything using both would look
 * like neither.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
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
           Warm achromatic greys, one step apart. Elevation is a lighter grey,
           never a shadow; separation is a 10%-white hairline, which sits on any
           of these surfaces without banding the way a solid grey would. */
        background: "#212121",
        foreground: "#FBFBFB",
        card: { DEFAULT: "#2C2C2C", fg: "#FBFBFB" },
        // Hover states, inactive tabs, and anything deliberately receding.
        muted: { DEFAULT: "#3C3C3C", fg: "#ADADAD" },
        // The one bright colour in the admin: the action that writes.
        primary: { DEFAULT: "#F7D619", fg: "#1A1A1A" },
        secondary: { DEFAULT: "#3C3C3C", fg: "#FBFBFB" },
        destructive: "#F0605F",
        border: "rgb(255 255 255 / 0.10)",
        input: "rgb(255 255 255 / 0.16)",
        ring: "#8E8E8E",
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
        // The admin's only face. A different family from the site's on purpose:
        // the tool should never read as part of the thing it edits.
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
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
