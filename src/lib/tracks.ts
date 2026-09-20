/**
 * A circuit: one row of `ctr.tracks`.
 *
 * A table rather than a field on the round, because a circuit outlives the
 * season that visits it. The same track is raced on twice in a year and again
 * next year, and its map, its length and its corner count do not change when the
 * calendar does. Rounds point at it by id.
 *
 * The map itself is edited on a screen of its own — see the note in the admin's
 * calendar panel — so nothing here assumes it is drawn by hand.
 *
 * Shared by the server (repo) and the browser (admin), so nothing in here may
 * import `server-only`.
 */

import { sitePath, type SiteRef } from "@/lib/sites";

/** One entry in a circuit's related links. Order is the order on the page. */
export type TrackLink = {
  /** What the link says. Falls back to the bare host when left blank. */
  label: string;
  href: string;
};

export type Track = {
  id: string;
  /**
   * The sport this belongs to. Set from the site the request was guarded
   * against, never from the body — a browser that could name its own site could
   * move a record into a sport it does not administer.
   */
  site_id: string;
  /** "Kari Motor Speedway". */
  name: string;
  /** Where it is, as one line — "Coimbatore, Tamil Nadu". */
  location: string;

  /* ── Pictures ── */
  /** A photograph of the circuit. What the calendar puts behind the next round. */
  photo_url: string;
  /** A drawing of the layout, as a raster image. Blank draws none. */
  map_url: string;
  /**
   * The layout as vector path data — the `d` of a single <path>.
   *
   * Preferred over map_url wherever it is set: it takes the page's colours, so
   * the outline is drawn in the accent rather than being a picture of a drawing.
   */
  svg_path: string;
  /** The coordinate space `svg_path` was drawn in. Defaults to `0 0 400 260`. */
  svg_view_box: string;

  /* ── The record ── */
  /** Free text, so "3.717 km (2.310 mi)" survives intact. */
  length: string;
  /** Free text for the same reason — "17", "12 (7 right)". */
  turns: string;
  /** "Clockwise" / "Anti-clockwise". */
  direction: string;
  /** Year, as text: a circuit opens in "1990" but also in "2010 (rebuilt)". */
  opened: string;
  broke_ground: string;
  /** "Madras Motor Race Track; Irungattukottai Race Track". */
  former_names: string;
  owner: string;
  /** "1", "2", "3" — the FIA's licence grade. */
  fia_grade: string;
  /** "13°0′9″N 79°59′9″E". Text, because that is how a circuit quotes them. */
  coordinates: string;
  capacity: string;
  /**
   * Anywhere worth sending a reader next: the circuit's own site, its entry
   * list, a lap record video, a map. Free-form, ordered, and edited as a list —
   * which is why it is JSONB and not a column per link. A schema that names its
   * links (`website`, `tickets`, `instagram`) has to be migrated every time
   * somebody wants a different kind.
   */
  links: TrackLink[];
  /** The championships it hosts, one per line. */
  major_events: string;
  /** How many races have been run here. A real count, so it can be summed. */
  races_held: number;
  /**
   * The outright lap record.
   *
   * The time and the year only. WHO set it and in WHAT are a racer and a team,
   * and they get tables of their own — a name typed in here would have to be
   * unpicked into a foreign key the moment those exist.
   */
  lap_record_time: string;
  lap_record_year: string;

  /** One line on what the circuit is like. */
  note: string;
  /** Ascending. Ties fall back to name. */
  sort_order: number;
};

export const TRACK_LIMITS = {
  name: 120,
  location: 120,
  photo_url: 500,
  map_url: 500,
  svg_path: 20_000,
  svg_view_box: 60,
  length: 60,
  turns: 60,
  direction: 40,
  opened: 40,
  broke_ground: 40,
  former_names: 200,
  owner: 120,
  fia_grade: 20,
  coordinates: 80,
  capacity: 60,
  link_label: 60,
  link_href: 300,
  major_events: 600,
  lap_record_time: 40,
  lap_record_year: 20,
  note: 300,
} as const;

/** More than a handful stops being "related" and starts being a directory. */
export const TRACK_MAX_LINKS = 6;

/** The coordinate space a hand-drawn outline is assumed to use. */
export const DEFAULT_VIEW_BOX = "0 0 400 260";

/** What a new circuit starts from. */
export const BLANK_TRACK: Omit<Track, "id" | "site_id"> = {
  name: "",
  location: "",
  photo_url: "",
  map_url: "",
  svg_path: "",
  svg_view_box: DEFAULT_VIEW_BOX,
  length: "",
  turns: "",
  direction: "",
  opened: "",
  broke_ground: "",
  former_names: "",
  owner: "",
  fia_grade: "",
  coordinates: "",
  capacity: "",
  links: [],
  major_events: "",
  races_held: 0,
  lap_record_time: "",
  lap_record_year: "",
  note: "",
  sort_order: 0,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same reasoning as sports: a malformed id should 404, not blow up Postgres. */
export function isTrackId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Clamps whatever came off the wire into a storable circuit. */
export function normaliseTrackInput(input: unknown): Omit<Track, "id" | "site_id"> {
  const record = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;

  const str = (value: unknown, max: number): string =>
    typeof value === "string" ? value.trim().slice(0, max) : "";

  const order = Number(record.sort_order);
  const races = Number(record.races_held);

  return {
    name: str(record.name, TRACK_LIMITS.name),
    location: str(record.location, TRACK_LIMITS.location),

    photo_url: normaliseTrackMap(record.photo_url),
    map_url: normaliseTrackMap(record.map_url),
    svg_path: normaliseSvgPath(record.svg_path),
    svg_view_box: str(record.svg_view_box, TRACK_LIMITS.svg_view_box) || DEFAULT_VIEW_BOX,

    length: str(record.length, TRACK_LIMITS.length),
    turns: str(record.turns, TRACK_LIMITS.turns),
    direction: str(record.direction, TRACK_LIMITS.direction),
    opened: str(record.opened, TRACK_LIMITS.opened),
    broke_ground: str(record.broke_ground, TRACK_LIMITS.broke_ground),
    former_names: str(record.former_names, TRACK_LIMITS.former_names),
    owner: str(record.owner, TRACK_LIMITS.owner),
    fia_grade: str(record.fia_grade, TRACK_LIMITS.fia_grade),
    coordinates: str(record.coordinates, TRACK_LIMITS.coordinates),
    capacity: str(record.capacity, TRACK_LIMITS.capacity),
    links: normaliseTrackLinks(record.links),
    major_events: str(record.major_events, TRACK_LIMITS.major_events),
    races_held: Number.isFinite(races) ? Math.max(0, Math.trunc(races)) : 0,
    lap_record_time: str(record.lap_record_time, TRACK_LIMITS.lap_record_time),
    lap_record_year: str(record.lap_record_year, TRACK_LIMITS.lap_record_year),

    note: str(record.note, TRACK_LIMITS.note),
    sort_order: Number.isFinite(order) ? Math.trunc(order) : 0,
  };
}

/**
 * The `d` of a single <path>, with everything that is not path data removed.
 *
 * This value is dropped straight into an SVG that the page renders, so it is
 * held to the alphabet a path is made of: the command letters, digits, and the
 * separators between them. A `<` cannot survive that filter, which is what makes
 * pasting a whole SVG file in here — or anything worse — harmless rather than an
 * injection. The paste simply does not draw, and the field says so.
 */
export function normaliseSvgPath(value: unknown): string {
  if (typeof value !== "string") return "";

  const trimmed = value.trim().slice(0, TRACK_LIMITS.svg_path);
  if (!trimmed) return "";

  const cleaned = trimmed.replace(/[^MmZzLlHhVvCcSsQqTtAa0-9.,\-+eE\s]/g, "").trim();

  // A path that does not begin with a move is not a path.
  return /^[Mm]/.test(cleaned) ? cleaned : "";
}

/**
 * The related links, cleaned.
 *
 * A link with no destination is not a link, so those are dropped rather than
 * stored empty — which also means the admin can leave a half-typed row lying
 * around without it reaching the page. A link with a destination but no label
 * gets the bare host as its label, so the page always has something to print.
 */
export function normaliseTrackLinks(value: unknown): TrackLink[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const record = (typeof entry === "object" && entry !== null ? entry : {}) as Record<
        string,
        unknown
      >;

      const href = normaliseLinkHref(record.href);
      const label =
        typeof record.label === "string" ? record.label.trim().slice(0, TRACK_LIMITS.link_label) : "";

      return { label: label || hostOf(href), href };
    })
    .filter((link) => link.href !== "")
    .slice(0, TRACK_MAX_LINKS);
}

/**
 * One link's address, cleaned — and given a scheme if it is missing one.
 *
 * People type `kari.com`. Before this, that was thrown away on save: the URL
 * parser rejects a bare host, the link was dropped, and the save still returned
 * 200 — so the row simply disappeared with nothing said. Silent data loss for
 * the most natural thing anyone could type.
 *
 * So a value that looks like a host gets `https://` put in front of it. What it
 * does NOT do is loosen what is accepted afterwards: the result still goes
 * through the same http(s)-or-/path check, so `javascript:` and friends are
 * rejected exactly as before — they already carry a scheme and are never
 * touched by the line below.
 */
export function normaliseLinkHref(value: unknown): string {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const hasScheme = /^[a-z][\w+.-]*:/i.test(trimmed);
  const isPath = trimmed.startsWith("/");
  // A dot with something either side of it, and no space: that is a hostname.
  const looksLikeHost = /^[^\s/]+\.[^\s/]{2,}/.test(trimmed);

  const addressed = !hasScheme && !isPath && looksLikeHost ? `https://${trimmed}` : trimmed;

  return normaliseTrackMap(addressed);
}

/**
 * Will this address survive a save?
 *
 * Exported so the admin can say so while it is being typed rather than letting
 * the row vanish afterwards. Same function the server uses, so the two can never
 * disagree about what is acceptable.
 */
export function isUsableHref(value: string): boolean {
  return normaliseLinkHref(value) !== "";
}

/** "madrasmotorsports.com" — the bare host, without the scheme or a leading www. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    // A /public path has no host. Its own path is the most useful thing to say.
    return url;
  }
}

/** A /public path or an http(s) URL. Anything else becomes no map at all. */
export function normaliseTrackMap(value: unknown): string {
  if (typeof value !== "string") return "";

  const trimmed = value.trim().slice(0, TRACK_LIMITS.map_url);
  if (!trimmed || trimmed.startsWith("//")) return "";
  if (trimmed.startsWith("/")) return trimmed;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

/** The circuit a round points at, or undefined when it points at nothing. */
export function findTrack(tracks: Track[], id: string): Track | undefined {
  return id ? tracks.find((track) => track.id === id) : undefined;
}

/* ─────────────────────────── Reading a circuit ─────────────────────────── */

/**
 * The circuit's own address: /circuits/madras-international-circuit.
 *
 * Derived from the name rather than stored in a column, because a stored slug is
 * a second thing to keep in step with the name — rename the circuit in the admin
 * and the URL would silently stay wrong until someone noticed the column.
 *
 * Two circuits sharing a name would share a slug, and the first in the list
 * wins. `findTrackBySlug` also accepts the id, so the loser is still reachable
 * and nothing 404s; a name that produces no letters at all (only punctuation)
 * falls back to the id outright.
 */
export function trackSlug(track: Pick<Track, "id" | "name"> & { slug?: string }): string {
  // The STORED address wins wherever there is one. It is a unique column now, so
  // it is the only answer that cannot collide — and it means renaming a circuit
  // no longer silently changes its address, the way renaming a form or a deck
  // has never been allowed to. Derivation stays for a Track built in the browser
  // from a form that has not been saved yet, which has no slug to prefer.
  if (track.slug) return track.slug;

  const slug = track.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || track.id;
}

/*
 * There is no page per record on this site — the calendar is one page, at
 * /schedule — so every address below is that page. The builders stay because
 * the sitemap and the revalidators go through them, and the day a record gets
 * a page of its own is the day this changes in one place.
 */
export function trackHref(
  site: SiteRef,
  _track: Pick<Track, "id" | "name"> & { slug?: string }
): string {
  return sitePath(site, "schedule");
}

/** The index of this sport's circuits. */
export function circuitsHref(site: SiteRef): string {
  return sitePath(site, "schedule");
}

/** Slug first, then id — see `trackSlug` for why both are accepted. */
export function findTrackBySlug(tracks: Track[], slug: string): Track | undefined {
  let wanted = slug;
  try {
    wanted = decodeURIComponent(slug);
  } catch {
    // A malformed escape ("%") is not a circuit. Match the raw string, fail, 404.
  }

  wanted = wanted.toLowerCase();

  return (
    tracks.find((track) => trackSlug(track) === wanted) ??
    tracks.find((track) => track.id.toLowerCase() === wanted)
  );
}

/** The championships it hosts, one per line, as a list. */
export function majorEventList(track: Track): string[] {
  return track.major_events
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Former names are typed semicolon-separated — see the admin's placeholder. */
export function formerNameList(track: Track): string[] {
  return track.former_names
    .split(/[;\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Has this circuit anything to draw at all? */
export function hasLayout(track: Track): boolean {
  return Boolean(track.svg_path || track.map_url);
}
