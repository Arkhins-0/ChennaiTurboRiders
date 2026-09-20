/**
 * What a folder may be called, and what a media key may look like.
 *
 * Deliberately NOT `server-only`. The browser runs the same validator, so the
 * New folder dialog can explain a rejection as somebody types rather than after
 * a round trip — the same argument `src/lib/roles.ts` makes for being shared.
 * One rule in one place is also the only way the client and the server cannot
 * disagree about what is allowed.
 *
 * ── On traversal, precisely ───────────────────────────────────────────────
 *
 * S3 does not normalise `..`. `a/../b` is a literal object name, not `b`, so
 * there is no filesystem to escape from and no directory to climb out of. The
 * real risk is narrower and worse: naming a key under a DIFFERENT prefix.
 * `ENTRY_PREFIX` (`ctr-sports/entries/`) holds licence scans and passport
 * photographs, and it is a SIBLING of `MEDIA_PREFIX` (`ctr-sports/media/`),
 * not a child. So `startsWith(MEDIA_PREFIX)` is the whole defence, and no key
 * that passes `isMediaKey` can reach a registration attachment.
 *
 * Rejecting `%` matters for the same reason: it means no percent-decode
 * anywhere later in the stack can turn a stored name back into `..` or `/`.
 *
 * ── On the second half of this file ───────────────────────────────────────
 *
 * Below the path rules sits a second question — WHOSE folder is this? — which
 * exists because a page editor scoped to the INCRC page must not be able to list,
 * fill or empty the decks page's media. That is an authorisation boundary, so it
 * is enforced in the routes; the predicates live here, beside the path rules they
 * are about, and are shared with the browser for the same reason the validators
 * are: the explorer has to know which folders to draw before it asks for any.
 */

import {
  canSeeAnySite,
  canSeeSiteSlug,
  type Scoped,
} from "@/lib/roles";

/**
 * The prefix everything this project uploads lives under.
 *
 * Defined HERE, and re-exported by `src/lib/server/s3.ts` for the server code
 * that has always imported it from there. It lived in three places until the
 * bucket was renamed and one of them was missed — which broke four images and
 * silently disabled the source-pin protection in the usage scan. One literal
 * cannot drift from itself.
 *
 * This file is the right home for it because it is the only one of the three
 * that is neither `server-only` nor client-only.
 */
export const MEDIA_PREFIX = "ctr-sports/media/";

/**
 * Four levels, and the depth is what makes folder delete bounded: creating one
 * is at most four puts, and nothing can build a tree deep enough to be slow to
 * walk.
 */
export const MAX_FOLDER_DEPTH = 4;

/** Long enough for "2025 season launch", short enough to read in a breadcrumb. */
export const MAX_SEGMENT = 48;

/**
 * Where a tile upload goes when nobody chose, and where a file is rescued to
 * when the record owning its folder is deleted.
 *
 * A root of its own rather than `_shared/uploads`, which is what the plan for
 * this phase sketched. The `_` was there to make a shared folder impossible to
 * confuse with a site's, and nothing needs it: `uploads` is in
 * `RESERVED_SITE_SLUGS` and in the CHECK constraint on `ctr.sites.slug`, so no
 * sport can ever be called that. Adding a leading underscore would instead mean
 * widening `SEGMENT` — the validator that keeps `..` and `/` out of a folder
 * name — to admit one reserved spelling. That is a poor trade for a problem the
 * database already refuses.
 */
export const DEFAULT_UPLOAD_FOLDER = "uploads";

/**
 * The folder a module's records live in, under their own site.
 *
 * `incrc/decks/world-of-ctr`, `landing/articles/season-opener`. Three segments:
 * the site, the module, then the record — which is inside `MAX_FOLDER_DEPTH`,
 * leaves the FIRST segment a site slug so `folderOwner` scopes it with no
 * special case, and keeps a site's own page uploads findable at its root instead
 * of buried among a folder per deck.
 *
 * ── What this replaced ────────────────────────────────────────────────────
 *
 * `decks/`, `circuits/` and `articles/` were top-level roots named after a
 * MODULE, from when there was one sport and the distinction did not exist. They
 * were the last thing in the project still organised by what a record IS rather
 * than by whose it is, and they came with a permission rule of their own —
 * `canEditAnywhere`, "may this account edit that module on ANY site?" — which
 * with two sports would have let a pickleball admin into the championship's
 * media pack. `scripts/migrate-media-sites.mjs` moved them; this is what they
 * became.
 *
 * `forms` is deliberately absent. A registration's attachments live under
 * `ENTRY_PREFIX`, a sibling of the media prefix, and are never public — so a
 * form has no folder here to name.
 *
 * `seasons` and `events` are two folders rather than one nested pair, even
 * though a round belongs to a season. Depth here is capped at three and the
 * entity segment is already the third; `incrc/seasons/2026/round-01/…` would be
 * a fourth. A round's folder is named after its own address, which is unique
 * within the sport, so nothing is lost but the nesting.
 */
export const MODULE_FOLDERS = {
  circuits: "circuits",
  articles: "articles",
  events: "events",
  seasons: "seasons",
  /*
   * The three migration 0024 added.
   *
   * `drivers` and `sponsors` get a folder per record, like the circuits —
   * a driver has a portrait and a wide plate, a sponsor has a mark and a
   * wordmark, and keeping each one's together is what makes deleting the
   * record able to tidy up after itself.
   *
   * `team` is a module folder with no records under it: the profile and the
   * car are one row each, so there is nothing to put a per-record folder
   * beneath. The team photograph, the principal's portrait and the three
   * car pictures all land directly in it.
   */
  drivers: "drivers",
  sponsors: "sponsors",
  team: "team",
} as const;

/** The modules that have a media folder. Not every site module does. */
export type MediaModule = keyof typeof MODULE_FOLDERS;

/**
 * Names that would be confusing, dangerous or both.
 *
 * `entries` because a folder of that name under media reads exactly like the
 * private attachment prefix and is not it; `media` because
 * `ctr-sports/media/media/…` is nobody's intention. The rest are Windows
 * device names, which are not a problem for S3 and are a problem for anyone who
 * ever syncs the bucket to a disk.
 */
const RESERVED = new Set(["entries", "media", "con", "prn", "aux", "nul"]);

/**
 * Letters and digits at both ends, letters, digits, spaces, hyphens and
 * underscores in between.
 *
 * What it excludes is the point, and it excludes by construction rather than by
 * a list of banned things: `/`, `\`, `.`, `%`, control characters, everything
 * non-ASCII, and the names `.` and `..`.
 */
const SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9 _-]*[A-Za-z0-9_-])?$/;

/**
 * One folder name, REBUILT rather than returned.
 *
 * The value that comes back is assembled here from what passed the test — it is
 * never the caller's string handed back. A validator that returns its input is
 * one refactor away from returning something that never went through the test
 * at all.
 *
 * Null means no. The routes turn that into a sentence per rule, because a
 * single "Invalid name." for six different rules is how somebody ends up typing
 * at a dialog until they give up.
 */
export function parseSegment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  // Collapse runs of spaces first, so "a  b" and "a b" cannot become two
  // folders that look identical in a breadcrumb.
  const name = raw.trim().replace(/ {2,}/g, " ");

  if (name.length < 1 || name.length > MAX_SEGMENT) return null;
  if (!SEGMENT.test(name)) return null;
  if (RESERVED.has(name.toLowerCase())) return null;

  return name;
}

/** Which rule a name broke, for the sentence the route sends back. */
export type SegmentProblem = "empty" | "long" | "charset" | "reserved";

export function segmentProblem(raw: unknown): SegmentProblem | null {
  if (typeof raw !== "string") return "empty";

  const name = raw.trim().replace(/ {2,}/g, " ");

  if (name.length < 1) return "empty";
  if (name.length > MAX_SEGMENT) return "long";
  if (!SEGMENT.test(name)) return "charset";
  if (RESERVED.has(name.toLowerCase())) return "reserved";

  return null;
}

/** The sentence for each, shared by the dialog and the route so they agree. */
export const SEGMENT_MESSAGES: Record<SegmentProblem, string> = {
  empty: "A folder needs a name.",
  long: `A folder name can be at most ${MAX_SEGMENT} characters.`,
  charset: "A folder name can only use letters, numbers, spaces, hyphens and underscores.",
  reserved: "That name is reserved.",
};

/**
 * A whole folder path. `""` is the root and is VALID — it is where every
 * existing upload already lives.
 *
 * Rebuilt segment by segment, so a path is only ever as trustworthy as each of
 * its parts.
 */
export function parseFolder(raw: unknown): string | null {
  if (raw === "" || raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return null;

  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return "";

  const parts = trimmed.split("/");
  if (parts.length > MAX_FOLDER_DEPTH) return null;

  const clean: string[] = [];
  for (const part of parts) {
    const segment = parseSegment(part);
    if (segment === null) return null;
    clean.push(segment);
  }

  return clean.join("/");
}

export function folderSegments(folder: string): string[] {
  return folder ? folder.split("/") : [];
}

/** "drivers/2025" → "drivers". The root's parent is the root. */
export function parentFolder(folder: string): string {
  const parts = folderSegments(folder);
  parts.pop();
  return parts.join("/");
}

/** A child of a folder, or null if either half — or the depth — fails. */
export function joinFolder(parent: string, name: string): string | null {
  const base = parseFolder(parent);
  const segment = parseSegment(name);

  if (base === null || segment === null) return null;

  const joined = base ? `${base}/${segment}` : segment;
  return folderSegments(joined).length > MAX_FOLDER_DEPTH ? null : joined;
}

/**
 * The readable half of a key, from the file the user chose.
 *
 * The charset here is exactly `[a-z0-9-]`, which is precisely what `publicUrl`
 * can concatenate without `encodeURIComponent`. That is why no new URL-encoding
 * step is needed anywhere in this feature — and why the usage scan can match on
 * a raw key.
 *
 * The extension is NOT taken from here. It comes from the validated MIME type,
 * exactly as the upload route has always done, so a file called `x.png` that is
 * really a PDF cannot name itself a PNG.
 */
export function slugifyFileName(name: string): string {
  const base = typeof name === "string" ? name.replace(/\.[^.]*$/, "") : "";

  const slug = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  // Something unnameable — a file called "文件.pdf" — still gets a key, because
  // the uuid after this is what makes it unique and the slug is only there to
  // be read.
  return slug || "file";
}

/**
 * A key this feature is allowed to touch.
 *
 * NOT ending in `/`, so a caller cannot delete a directory marker through the
 * file route and make a folder vanish from under somebody. See the note at the
 * top for why `startsWith` is the whole of the prefix defence.
 */
export function isMediaKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  if (key.length === 0 || key.length > 512) return false;
  if (!key.startsWith(MEDIA_PREFIX)) return false;
  if (key.endsWith("/")) return false;
  if (key.includes("..") || key.includes("//") || key.includes("%")) return false;

  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(key)) return false;

  return true;
}

/** The folder a key sits in, or "" for the root. */
export function folderOfKey(key: string): string {
  const rest = key.slice(MEDIA_PREFIX.length);
  const cut = rest.lastIndexOf("/");
  return cut < 0 ? "" : rest.slice(0, cut);
}

/* ─────────────────── Which site owns a folder, and who may touch it ─────────────────── */

/**
 * The top-level folder is the SITE's slug.
 *
 * It used to be the page key — `landing/`, `incrc/`, `decks/`, `circuits/` —
 * which worked because `PAGE_KEYS` was a fixed tuple and the same tuple named
 * both the folders and the access scopes. Sports are rows now, so there is no
 * tuple to test against, and the test becomes: does this account hold a grant
 * on a site of that name?
 *
 * That is a better question than the old one, not just a different one. It
 * needs no list of every site to be passed around, it fails closed for a
 * folder naming a site that does not exist, and the browser can answer it from
 * the session alone — which is what keeps this file free of the database and
 * shared with the media explorer.
 *
 * ── The two things that are not a site ───────────────────────────────────
 *
 * `uploads/` belongs to no site by construction — it is where an unchosen
 * upload lands and where a deleted record's shared files are rescued to — and
 * the media ROOT holds every file uploaded before folders existed at all, which
 * is unattributed and un-attributable.
 *
 * There used to be a third kind. `decks/`, `circuits/` and `articles/` were
 * roots named after a MODULE, from when there was one sport and the distinction
 * did not exist, and they carried a permission rule of their own: "may this
 * account edit that module on ANY site?". With two sports that rule would have
 * let a pickleball admin into the championship's media pack. Phase 6 moved them
 * under the site whose records they hold, so the question a folder asks is one
 * question — whose site is this? — with two named exceptions rather than a
 * second permission model beside it.
 */

/**
 * Folders belonging to no site in particular.
 *
 * `uploads` is where a tile upload goes when nobody chose, and where a shared
 * file is rescued to when the entity owning its folder is deleted. It is
 * cross-cutting by construction, so it cannot belong to one site.
 */
export const SHARED_ROOTS: string[] = [DEFAULT_UPLOAD_FOLDER];

/** What a folder's first segment turns out to name. */
export type FolderOwner =
  | { kind: "root" }
  | { kind: "shared"; root: string }
  | { kind: "site"; slug: string };

/**
 * Whose folder is this?
 *
 * `root` is the media root, where every upload made before folders existed
 * still sits — unattributed, and un-attributable. It reads like `shared` and
 * writes like nothing else, which is why the two are separate cases here even
 * though `canBrowseFolder` treats them alike.
 */
export function folderOwner(folder: string): FolderOwner | null {
  const clean = parseFolder(folder);
  if (clean === null) return null;
  if (clean === "") return { kind: "root" };

  const root = clean.split("/")[0];

  if (SHARED_ROOTS.includes(root)) return { kind: "shared", root };

  return { kind: "site", slug: root };
}

/**
 * Whether this account may LIST a folder.
 *
 * A site's folder is that site's team and the owner. Everything belonging to no
 * site — the shared folder and the media root — is readable by anyone with any
 * grant at all, because the root is where a good deal of the site's imagery
 * still lives and hiding it would leave a scoped editor with nothing to pick
 * from.
 *
 * Three cases where there were four. Losing the fourth is the point of phase 6:
 * a folder's first segment names a site or it names one of two things that
 * deliberately belong to nobody, and there is no longer a shape that answers
 * "anyone who edits decks, on any sport".
 */
export function canBrowseFolder(session: Scoped | null | undefined, folder: string): boolean {
  const owner = folderOwner(folder);
  if (owner === null) return false;

  switch (owner.kind) {
    case "root":
    case "shared":
      return canSeeAnySite(session);
    case "site":
      return canSeeSiteSlug(session, owner.slug);
  }
}

/**
 * Whether this account may UPLOAD INTO or DELETE FROM a folder.
 *
 * Identical to browsing except at the root, which is owners only. Those files
 * are unattributed, they are the ones most likely to be shared between sites,
 * and there is no scan that can prove otherwise — so the account that may
 * remove one is the account that can see every site it might be on.
 */
export function canWriteFolder(session: Scoped | null | undefined, folder: string): boolean {
  const clean = parseFolder(folder);
  if (clean === null) return false;
  if (clean === "") return session?.role === "owner";

  return canBrowseFolder(session, clean);
}

/**
 * The top-level folders to draw for this account, site folders first.
 *
 * `allSiteSlugs` is passed in rather than derived from the session, because an
 * owner holds no grants — their reach is the role, not a list — and the
 * explorer still has to show them every site. A member's own slugs come from
 * their grants and the argument is ignored.
 */
export function visibleRoots(
  session: Scoped | null | undefined,
  allSiteSlugs: string[] = []
): string[] {
  if (!canSeeAnySite(session)) return [];

  const sites =
    session?.role === "owner"
      ? [...allSiteSlugs]
      : [...new Set((session?.grants ?? []).map((grant) => grant.siteSlug))].sort();

  return [...sites, ...SHARED_ROOTS];
}

/**
 * Whether this account may delete a file that something still points at.
 *
 * The second lock, and the one folder permission cannot provide. An INCRC
 * editor owns `incrc/`, so they may delete out of it — but the media library
 * offers every picture to every screen, so a file in `incrc/` may well be the
 * photograph on the landing page. Deleting it would break a site they do not
 * administer, from inside a folder they do.
 *
 * So: an UNREFERENCED file may be deleted by anyone who may write its folder,
 * and a referenced one only if every site named is one they administer. The
 * gate bites exactly where it matters and nowhere else.
 *
 * A ref belonging to no site — something the code itself pins — takes an owner.
 * That is the strict reading of `null`, and the right one: nobody else can see
 * the thing that would break.
 */
export function canOverrideUsage(
  session: Scoped | null | undefined,
  refs: { site: string | null }[]
): boolean {
  if (!session) return false;
  if (session.role === "owner") return true;

  return refs.every((ref) => ref.site !== null && canSeeSiteSlug(session, ref.site));
}

/* ─────────────────────────── An entity's own folder ─────────────────────────── */

/**
 * A deterministic folder segment for one record.
 *
 * A slug is very nearly a folder name already — `slugify` emits `[a-z0-9-]`, a
 * strict subset of `SEGMENT` — but "very nearly" is not a guarantee, and two
 * cases genuinely differ:
 *
 *   LENGTH    `SLUG_MAX` is 80 and `MAX_SEGMENT` is 48. A slug in between is a
 *             legal address and an illegal folder name.
 *   RESERVED  a deck slugged `media` is a legal address and a refused folder.
 *
 * Both fall back to a short piece of the record's id rather than throwing. The
 * caller is a save that has already succeeded; refusing here would mean a record
 * that exists and has nowhere to put its pictures.
 *
 * DETERMINISM is the whole requirement. This is called once to decide where an
 * upload goes, and again later to find that same folder in order to move or
 * delete it. The two calls have to agree, so nothing here may be random or
 * time-based — which is why the id is used and `fallbackSlug` is not.
 */
export function entitySegment(slug: string, id: string): string {
  if (slug.length <= MAX_SEGMENT) {
    const direct = parseSegment(slug);
    if (direct !== null) return direct;
  }

  // Enough of the id to separate two records whose slugs agree this far, and
  // short enough to leave the slug readable: a uuid's first eight hex digits.
  const short = id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "record";
  const head = slug.slice(0, Math.max(MAX_SEGMENT - short.length - 1, 0)).replace(/-+$/, "");

  return parseSegment(head ? `${head}-${short}` : short) ?? short;
}

/**
 * `incrc/decks/world-of-ctr`. Where one record's pictures live.
 *
 * Three builders became this one. `folderForEntity(root, slug, id)` took a
 * module root, `folderForArticle(site, …)` and `folderForEvent(site, …)` each
 * hardcoded their own module underneath a site, and the three could not be told
 * apart by anything except which one the caller happened to import. There is one
 * shape now and the module is a parameter of it.
 *
 * The first segment is the site slug, so `folderOwner` scopes the result with no
 * special case — which is the whole of what phase 6 bought.
 *
 * DETERMINISM is the requirement, as it was: this is called once to decide where
 * an upload goes and again later to find that same folder in order to move or
 * delete it. The two calls have to agree, so nothing here may be random or
 * time-based.
 */
export function folderForEntity(
  siteSlug: string,
  module: MediaModule,
  slug: string,
  id: string
): string {
  return `${siteSlug}/${MODULE_FOLDERS[module]}/${entitySegment(slug, id)}`;
}

/**
 * A module's folder on one site, with no record named: `incrc/decks`.
 *
 * What an editor's uploads fall back to before anything is open — a screen with
 * no deck selected still has to put a dropped file somewhere, and somewhere
 * under the sport is better than the shared folder.
 */
export function folderForModule(siteSlug: string, module: MediaModule): string {
  return `${siteSlug}/${MODULE_FOLDERS[module]}`;
}

/**
 * `landing/sports` — the cards on the landing page.
 *
 * Not a module: a sports card is a row of `ctr.sports` with no address of its
 * own, so there is no record to name a folder after and no module list it
 * belongs to. It is still nested under the site whose screen edits it, which is
 * the rule the rest of this file now follows without exception.
 *
 * Took no argument until phase 6, when it was the literal `landing/sports` —
 * correct, because the root site's slug IS `landing`, and one hardcoded slug too
 * many in a file about who owns what.
 */
export function folderForSports(siteSlug: string): string {
  return `${siteSlug}/sports`;
}
