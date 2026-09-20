/**
 * Refuses source files carrying characters no source file should carry.
 *
 *   npm run check:source
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * A literal NUL byte inside a string got into FieldValidation.tsx. TypeScript
 * accepts it — a string may hold any character but a newline or its own quote —
 * and `next build` accepts it, because the production minifier escapes it on
 * the way out. The DEVELOPMENT bundler does not: it wrote the raw byte into the
 * chunk, the browser read it as the end of the script, and the entire forms
 * screen failed to load with
 *
 *     SyntaxError: "" literal not terminated before end of script
 *
 * — a message that names no file of ours and points at a compiled chunk. So the
 * two checks this project already runs on every change were both green while
 * the admin was broken. That is the gap this closes.
 *
 * ── What it looks for ─────────────────────────────────────────────────────
 *
 *   control characters   anything below 0x20 that is not tab, newline or
 *                        carriage return, plus DEL. None of them can be typed
 *                        on purpose; every one arrives by accident.
 *   U+2028 / U+2029      line and paragraph separators. Invisible, and treated
 *                        as line breaks by some parsers — the same failure with
 *                        a different byte.
 *   a stray BOM          harmless at the very start of a file, and a syntax
 *                        error anywhere else.
 *
 * Escaped forms — "\\u0000", "\\x1b" — are untouched and always fine. It is the
 * raw byte that breaks things, and writing it as an escape is the fix.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".md"];

/** Every file under a directory, depth first. */
function walk(dir) {
  const found = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...walk(path));
    } else if (EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      found.push(path);
    }
  }

  return found;
}

function nameOf(code) {
  if (code === 0) return "NUL";
  if (code === 0x7f) return "DEL";
  if (code === 0x2028) return "LINE SEPARATOR";
  if (code === 0x2029) return "PARAGRAPH SEPARATOR";
  if (code === 0xfeff) return "BYTE ORDER MARK";
  return `control 0x${code.toString(16)}`;
}

const problems = [];

for (const root of ROOTS) {
  for (const path of walk(root)) {
    const text = readFileSync(path, "utf8");

    for (let index = 0; index < text.length; index += 1) {
      const code = text.codePointAt(index);

      const banned =
        (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
        code === 0x7f ||
        code === 0x2028 ||
        code === 0x2029 ||
        // A BOM is only ever acceptable as the very first character.
        (code === 0xfeff && index > 0);

      if (!banned) continue;

      const line = text.slice(0, index).split("\n").length;
      problems.push(`${relative(process.cwd(), path)}:${line} — ${nameOf(code)}`);
    }
  }
}

if (problems.length === 0) {
  console.log("No stray control characters in src/ or scripts/.");
  process.exit(0);
}

console.error(`${problems.length} stray character(s) — write them as escapes instead:\n`);
for (const problem of problems) console.error(`  ${problem}`);
process.exit(1);
