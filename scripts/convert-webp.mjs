/**
 * Turns every PNG/JPEG under public/images into a WebP.
 *
 *   npm run webp            convert whatever has no .webp yet
 *   npm run webp -- --dry   report what it would do, write nothing
 *   npm run webp -- --force re-convert everything, from the kept originals
 *   npm run webp -- --restore  put the original files back
 *
 * Nothing resizes images at request time — the site uses plain <img> tags
 * pointing straight at these files, so what is on disk is exactly what every
 * visitor downloads. This script is the only thing standing between a camera
 * original and the browser.
 *
 * ── Not blurring things ───────────────────────────────────────────────────
 *
 * The first version of this script softened almost everything it touched, in
 * three separate ways, and all three are worth naming because each one is easy
 * to reintroduce:
 *
 *   it shrank art below its drawn size   a logo drawn at 240 CSS px was cut to
 *       640px wide, which is under 3x on a phone. No CSS gets that detail back.
 *   it encoded FLAT ART as a photograph  lossy WebP is built for photographs.
 *       Run over a wordmark or a crest it puts ringing around every edge of
 *       type, which reads exactly as "blurry" however high the quality goes.
 *       That is what `kind: "art"` below is for: those are stored losslessly,
 *       and a PNG of flat colour still comes out far smaller than the PNG did.
 *   it resampled without sharpening      any downscale costs acuity. Where one
 *       genuinely has to happen, a light sharpen puts back what the resampling
 *       took, and it is applied ONLY then — sharpening an image that was not
 *       resized just adds crunch.
 *
 * So the caps below are ceilings for absurdly large uploads, not targets. If an
 * asset arrives smaller than its cap it is re-encoded at its own size and never
 * touched again. When in doubt, raise the cap: bytes are cheaper than a
 * photograph that looks soft on the one screen the client owns.
 *
 * ── Re-running ────────────────────────────────────────────────────────────
 *
 * Converting MOVES the source into public/_originals/ (git-ignored) and deletes
 * it from public/images, so a second run finds no PNG to work from. `--force`
 * therefore reads from the backup: it is the way to redo everything after these
 * settings change, and it is why the backup is never overwritten.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMAGES = path.join(ROOT, "public", "images");
const BACKUP = path.join(ROOT, "public", "_originals");

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
const RESTORE = process.argv.includes("--restore");

/**
 * The largest each class of asset is allowed to be, and how it is encoded.
 *
 * `max` is a CEILING, not a target — it exists so a 6000px camera original does
 * not ship whole. Every number here is several times the size the asset is
 * actually drawn at, which `at` records so it can be rechecked when a layout
 * moves. First match wins.
 *
 * `lossless` is reserved for small, flat marks. It is tempting to reach for it
 * on every logo, and on the shaded crests this site uses it was measured at
 * three to four times the size of quality 95 for no difference anybody can see
 * — 477 KB against 185 KB for one crest drawn at 48px. Lossless earns its bytes
 * on two-colour artwork of a few kilobytes; past that, high quality with full
 * colour resolution is both sharper than the old settings and far smaller.
 */
const RULES = [
  { test: /^hero\//i, max: 2560, at: "full-bleed hero" },
  { test: /^brand\//i, max: 1024, at: "splash logo w-[min(190px,42vw)], 5x" },
  { test: /^sports\//i, max: 768, at: "crest: h-12 in a card, w-28 in the band — 7x" },
  // Two-colour wordmarks of a few KB, and 320px to begin with: lossless here is
  // free, and a wordmark is the one thing lossy encoding really does spoil.
  { test: /^incrc\/(jktyre|fmsci)\./i, max: 960, lossless: true, at: "partner lockup h-9" },
  { test: /^incrc\/cars-lineup\./i, max: 2048, at: "grid render, full width" },
  { test: /^incrc\/(family|one-nation)\./i, max: 2560, at: "full-bleed banner" },
  { test: /^incrc\//i, max: 2048, at: "figure up to 1024 CSS px, 2x" },
  { test: /./, max: 2048, at: "default" },
];

/**
 * Quality for the lossy path — high, and deliberately so.
 *
 * The old settings used 80 to 84. These files are the finished article every
 * visitor downloads, there is no second smaller variant, and the difference
 * between 82 and 92 is a few kilobytes against a photograph that looks washy on
 * a good screen.
 */
const PHOTO_QUALITY = 92;

const SOURCE_EXTENSIONS = /\.(png|jpe?g)$/i;

function ruleFor(relativePath) {
  const key = relativePath.split(path.sep).join("/");
  return RULES.find((rule) => rule.test.test(key));
}

/** Every file under `dir`, as paths relative to it. */
async function walk(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full, base)));
    } else {
      files.push(path.relative(base, full));
    }
  }

  return files;
}

function kb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

async function restore() {
  const files = (await walk(BACKUP)).filter((file) => SOURCE_EXTENSIONS.test(file));
  if (files.length === 0) {
    console.log("Nothing in public/_originals to restore.");
    return;
  }

  for (const relative of files) {
    const target = path.join(IMAGES, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(BACKUP, relative), target);

    // Drop the WebP that replaced it, so the original is what gets served again.
    const webp = target.replace(SOURCE_EXTENSIONS, ".webp");
    await fs.rm(webp, { force: true });

    console.log(`restored  ${relative}`);
  }

  console.log(`\nRestored ${files.length} file(s).`);
}

const exists = (file) =>
  fs.stat(file).then(
    () => true,
    () => false
  );

/**
 * Everything there is to convert, and where to read each one from.
 *
 * Both places are looked in, because converting deletes the source: a file that
 * has already been through here exists only in the backup, and `--force` has to
 * be able to redo it from the true original rather than from the WebP it
 * produced last time. Re-encoding an encode is how quality is lost twice.
 */
async function workList() {
  const live = (await walk(IMAGES)).filter((file) => SOURCE_EXTENSIONS.test(file));
  const kept = (await walk(BACKUP)).filter((file) => SOURCE_EXTENSIONS.test(file));

  return [...new Set([...live, ...kept])].sort();
}

async function convert() {
  const files = await workList();

  if (files.length === 0) {
    console.log("No PNG or JPEG files under public/images — nothing to do.");
    return;
  }

  let converted = 0;
  let before = 0;
  let after = 0;

  for (const relative of files) {
    const live = path.join(IMAGES, relative);
    const backup = path.join(BACKUP, relative);
    const target = live.replace(SOURCE_EXTENSIONS, ".webp");
    const rule = ruleFor(relative);

    // The untouched file if it is still there, otherwise the one kept from the
    // last run. Never the .webp.
    const source = (await exists(live)) ? live : backup;
    if (!(await exists(source))) continue;

    if (!FORCE && (await exists(target))) {
      console.log(`skip      ${relative}  (${path.basename(target)} already exists)`);
      continue;
    }

    const original = await fs.readFile(source);
    const image = sharp(original);
    const meta = await image.metadata();
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
    const shrinking = longest > rule.max;

    let pipeline = image.resize({
      width: rule.max,
      height: rule.max,
      fit: "inside",
      // A small source is re-encoded at its own size, never upscaled.
      withoutEnlargement: true,
    });

    // Only where the resize actually happened, and only on the lossy path.
    // Resampling costs acuity and this puts it back — but sharpening ADDS
    // high-frequency detail, which a lossless encoder then has to store
    // faithfully: doing both took one render from 129 KB to 382 KB for a
    // picture nobody could tell apart.
    if (shrinking && !rule.lossless) pipeline = pipeline.sharpen({ sigma: 0.6 });

    const output = await (rule.lossless
      ? // The same pixels out as in, so type and hard edges cannot ring.
        // `effort: 6` is the encoder searching harder for a smaller file, not a
        // quality trade.
        pipeline.webp({ lossless: true, effort: 6 })
      : pipeline.webp({
          quality: PHOTO_QUALITY,
          effort: 6,
          // Keeps full colour resolution. The default throws away three
          // quarters of it, which is what put coloured mush along every hard
          // edge — the accent yellow above all — and read as "blurry" whatever
          // the quality number said.
          smartSubsample: true,
        })
    ).toBuffer();

    before += original.length;
    after += output.length;
    converted += 1;

    console.log(
      `${DRY ? "would    " : "convert  "}${relative} -> ${path.basename(target)}  ` +
        `${longest}px ${kb(original.length)} -> ${Math.min(longest, rule.max)}px ${kb(output.length)}  ` +
        `[${rule.lossless ? "lossless" : `q${PHOTO_QUALITY}`}${shrinking ? ", resized" : ""} · ${rule.at}]`
    );

    if (DRY) continue;

    // Preserve the original before the source file is removed. An existing
    // backup is never overwritten, so re-running cannot lose the true original.
    if (!(await exists(backup))) {
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.writeFile(backup, original);
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, output);
    await fs.rm(live, { force: true });
  }

  if (converted === 0) {
    console.log("\nNothing to convert. Pass --force to redo files that already have a .webp.");
    return;
  }

  const saved = before - after;
  console.log(
    `\n${DRY ? "Would convert" : "Converted"} ${converted} file(s): ` +
      `${kb(before)} -> ${kb(after)} (${kb(saved)} saved, ${Math.round((saved / before) * 100)}%).`
  );
  if (!DRY) console.log("Originals kept in public/_originals/ — `npm run webp -- --restore` undoes this.");
}

try {
  await (RESTORE ? restore() : convert());
} catch (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}
