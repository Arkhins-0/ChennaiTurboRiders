/**
 * A body somebody WROTE: paragraphs, headings, quotes, lists and pictures.
 *
 * This was `src/lib/articles.ts` until an event needed the same thing. Nothing
 * in it was ever about articles — it is the document model, its allowlist and
 * the two functions that read one back out — and leaving it named for the first
 * feature that wanted it is how the second one concludes it must write its own.
 *
 * Two things store one of these today, and they store it the same way: a `body
 * jsonb` column, normalised on the way in AND on the way out.
 *
 * ── Why the body is a document and not HTML ───────────────────────────────
 *
 * See `normaliseRichText` below. It is the whole security argument and it
 * belongs beside the code that enforces it.
 *
 * Shared by the server and the browser, so nothing here may import `server-only`.
 */

import { image, isRecord, link, optionalText } from "@/lib/normalise";

/* ─────────────────────────────── Limits ─────────────────────────────── */

export const RICH_LIMITS = {
  /** One run of text between two marks. Generous — it is a paragraph, not a label. */
  text: 5000,
  alt: 200,
} as const;

/**
 * What a whole body may hold.
 *
 * Not arbitrary limits for their own sake: `normaliseRichText` walks a tree that
 * arrived as JSON from a browser, and a tree with no bound on its size or its
 * depth is a way to spend the server's stack on one request. The numbers are far
 * above any article anybody will write and far below anything that hurts.
 */
export const RICH_MAX_NODES = 2000;
export const RICH_MAX_IMAGES = 60;
export const RICH_MAX_DEPTH = 6;

/* ─────────────────────────── The document ───────────────────────────── */

/**
 * The marks a run of text may carry.
 *
 * Underline is here and is NOT a Markdown concept, which is the short answer to
 * why the body is not Markdown. It was asked for, and a Markdown body would have
 * had to invent a convention for it.
 */
export type RichMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "link"; attrs: { href: string } };

export type RichInline =
  | { type: "text"; text: string; marks?: RichMark[] }
  | { type: "hardBreak" };

export type RichListItem = { type: "listItem"; content: RichNode[] };

/**
 * Headings start at 2 because the page prints the record's title as its H1.
 * A second H1 in the body is not a style preference, it is a broken outline.
 */
export type RichNode =
  | { type: "paragraph"; content?: RichInline[] }
  | { type: "heading"; attrs: { level: 2 | 3 }; content?: RichInline[] }
  | { type: "blockquote"; content: RichNode[] }
  | { type: "bulletList"; content: RichListItem[] }
  | { type: "orderedList"; content: RichListItem[] }
  | { type: "image"; attrs: { src: string; alt: string } }
  | { type: "horizontalRule" };

export type RichDoc = { type: "doc"; content: RichNode[] };

export const EMPTY_DOC: RichDoc = { type: "doc", content: [] };

/* ──────────────────────── Normalising the body ──────────────────────── */

/**
 * The body, read through a closed set of node types.
 *
 * ── This function is the security boundary ────────────────────────────────
 *
 * Storing the body as HTML would have made this the first place in the project
 * where untrusted markup reaches the DOM, and it would have needed a sanitiser
 * dependency to be safe. Storing a TREE means the public renderer is a `switch`
 * over the union above, and a node type it does not recognise renders as nothing.
 * There is no payload to sanitise because there is no markup — the renderer emits
 * React elements it chose, never a string somebody else wrote.
 *
 * That guarantee only holds if this function is the only way a body is written,
 * and if it works by ALLOWLIST rather than by removing known-bad things. Every
 * branch below names what it keeps; the fall-through drops.
 *
 * Two attributes are still addresses, and they go through the same two helpers
 * every other URL in this project does:
 *
 *   image()  an <img src>, which is why `javascript:` and `//host` cannot be one
 *   link()   an <a href>, same rule plus in-page anchors
 *
 * ── Why it runs on read as well as write ──────────────────────────────────
 *
 * The rule stated at the top of normalise.ts. A row written by an older version,
 * or half-edited, degrades one node at a time rather than taking the page down —
 * and a node type retired from the union in a future version stops rendering
 * without needing a migration.
 *
 * `dropped` counts what did not survive, so the editor can say so instead of
 * quietly losing a paragraph behind a "Saved" badge.
 */
type Budget = { nodes: number; images: number; dropped: number };

function normaliseMarks(value: unknown): RichMark[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const marks: RichMark[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.type !== "string") continue;
    if (seen.has(entry.type)) continue;

    if (entry.type === "bold" || entry.type === "italic" || entry.type === "underline") {
      seen.add(entry.type);
      marks.push({ type: entry.type });
      continue;
    }

    if (entry.type === "link") {
      const attrs = isRecord(entry.attrs) ? entry.attrs : {};
      // An unusable href drops the MARK, not the text it was on — losing the
      // words because the address was wrong is not what anybody meant.
      const href = link(attrs.href, "");
      if (!href) continue;
      seen.add("link");
      marks.push({ type: "link", attrs: { href } });
    }
  }

  return marks.length > 0 ? marks : undefined;
}

function normaliseInline(value: unknown, budget: Budget): RichInline[] {
  if (!Array.isArray(value)) return [];

  const out: RichInline[] = [];

  for (const entry of value) {
    if (budget.nodes >= RICH_MAX_NODES) break;
    if (!isRecord(entry)) continue;

    if (entry.type === "hardBreak") {
      budget.nodes += 1;
      out.push({ type: "hardBreak" });
      continue;
    }

    if (entry.type === "text" && typeof entry.text === "string") {
      const text = entry.text.slice(0, RICH_LIMITS.text);
      // An empty run carries no information and its marks have nothing to mark.
      if (!text) continue;
      budget.nodes += 1;
      const marks = normaliseMarks(entry.marks);
      out.push(marks ? { type: "text", text, marks } : { type: "text", text });
      continue;
    }

    budget.dropped += 1;
  }

  return out;
}

function normaliseListItems(value: unknown, depth: number, budget: Budget): RichListItem[] {
  if (!Array.isArray(value)) return [];

  const items: RichListItem[] = [];

  for (const entry of value) {
    if (budget.nodes >= RICH_MAX_NODES) break;
    if (!isRecord(entry) || entry.type !== "listItem") {
      budget.dropped += 1;
      continue;
    }

    budget.nodes += 1;
    const content = normaliseBlocks(entry.content, depth + 1, budget);
    // A bullet with nothing in it is a bullet nobody typed.
    if (content.length > 0) items.push({ type: "listItem", content });
  }

  return items;
}

function normaliseBlocks(value: unknown, depth: number, budget: Budget): RichNode[] {
  // Depth is bounded because the tree arrived as JSON from a browser and this
  // walk is recursive. Six is deeper than any list anybody nests on purpose.
  if (!Array.isArray(value) || depth > RICH_MAX_DEPTH) return [];

  const out: RichNode[] = [];

  for (const entry of value) {
    if (budget.nodes >= RICH_MAX_NODES) break;
    if (!isRecord(entry) || typeof entry.type !== "string") {
      budget.dropped += 1;
      continue;
    }

    const attrs = isRecord(entry.attrs) ? entry.attrs : {};

    switch (entry.type) {
      case "paragraph": {
        budget.nodes += 1;
        const content = normaliseInline(entry.content, budget);
        // An empty paragraph is kept: it is a deliberate gap between two others,
        // and the editor shows it as one.
        out.push(content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" });
        break;
      }

      case "heading": {
        budget.nodes += 1;
        const content = normaliseInline(entry.content, budget);
        // Anything outside 2–3 becomes a 2 rather than being dropped: the words
        // are the point and the level is a detail the writer can fix.
        const level = attrs.level === 3 ? 3 : 2;
        out.push(
          content.length > 0
            ? { type: "heading", attrs: { level }, content }
            : { type: "heading", attrs: { level } }
        );
        break;
      }

      case "blockquote": {
        budget.nodes += 1;
        const content = normaliseBlocks(entry.content, depth + 1, budget);
        if (content.length > 0) out.push({ type: "blockquote", content });
        break;
      }

      case "bulletList":
      case "orderedList": {
        budget.nodes += 1;
        const content = normaliseListItems(entry.content, depth, budget);
        if (content.length > 0) out.push({ type: entry.type, content });
        break;
      }

      case "image": {
        if (budget.images >= RICH_MAX_IMAGES) {
          budget.dropped += 1;
          break;
        }
        // The one place an <img src> is decided. An unusable address drops the
        // whole node — an empty src renders as a broken image, which is worse
        // than no image, and is the same call `normaliseDeckPages` makes.
        const src = image(attrs.src, "");
        if (!src) {
          budget.dropped += 1;
          break;
        }
        budget.nodes += 1;
        budget.images += 1;
        out.push({
          type: "image",
          attrs: { src, alt: optionalText(attrs.alt, RICH_LIMITS.alt) },
        });
        break;
      }

      case "horizontalRule": {
        budget.nodes += 1;
        out.push({ type: "horizontalRule" });
        break;
      }

      default:
        // The allowlist's fall-through. Everything not named above lands here.
        budget.dropped += 1;
    }
  }

  return out;
}

export function normaliseRichText(value: unknown, notes?: string[]): RichDoc {
  const record = isRecord(value) ? value : {};
  const budget: Budget = { nodes: 0, images: 0, dropped: 0 };
  const content = normaliseBlocks(record.content, 0, budget);

  if (budget.dropped > 0) {
    notes?.push(
      budget.dropped === 1
        ? "One thing in the text could not be stored and was removed."
        : `${budget.dropped} things in the text could not be stored and were removed.`
    );
  }

  if (budget.nodes >= RICH_MAX_NODES) {
    notes?.push("The text reached its length limit and the end of it was cut off.");
  }

  return { type: "doc", content };
}

/* ─────────────────────── Reading a body back out ────────────────────── */

/** Whether there is anything to show. An empty paragraph is not something. */
export function richTextIsEmpty(doc: RichDoc): boolean {
  return !doc.content.some((node) => {
    if (node.type === "image" || node.type === "horizontalRule") return true;
    if (node.type === "paragraph" || node.type === "heading") {
      return (node.content ?? []).some((inline) => inline.type === "text" && inline.text.trim());
    }
    return true;
  });
}

/**
 * The body as plain words, for a description when nobody wrote a summary.
 *
 * Blocks are joined with a space rather than a newline: the result goes into a
 * `<meta>` tag and an OpenGraph description, neither of which has lines.
 */
export function richTextWords(doc: RichDoc, max = 300): string {
  const parts: string[] = [];

  const walk = (nodes: RichNode[]): void => {
    for (const node of nodes) {
      if (parts.join(" ").length >= max) return;

      if (node.type === "paragraph" || node.type === "heading") {
        for (const inline of node.content ?? []) {
          if (inline.type === "text") parts.push(inline.text);
        }
      } else if (node.type === "blockquote") {
        walk(node.content);
      } else if (node.type === "bulletList" || node.type === "orderedList") {
        for (const item of node.content) walk(item.content);
      }
    }
  };

  walk(doc.content);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, max);
}
