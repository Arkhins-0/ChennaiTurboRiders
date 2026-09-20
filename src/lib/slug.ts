/**
 * What makes a usable address, in one place.
 *
 * Two things in this project publish at an address somebody types, prints or
 * puts behind a QR code — a registration form and a deck — and both suggest one
 * from a name. Two copies of that rule is how a name ends up producing a slug
 * the validator beside it then rejects, which is exactly the bug the note on
 * `isUsableSlug` records.
 *
 * Shared by the server and the browser, so nothing here may import `server-only`.
 */

/** As long as the columns allow. Both tables store `text`, so this is the rule. */
export const SLUG_MAX = 80;

/**
 * A slug suggested from a name.
 *
 * Only ever a suggestion. The column is the truth, because the address outlives
 * the name — see the note on the forms table in migrations/0001_baseline.sql.
 */
export function slugify(name: string, max: number = SLUG_MAX): string {
  // The same decomposition trackSlug uses: strip the accents, then anything
  // that is not a letter or a digit becomes a hyphen.
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

/**
 * Lower case, digits and hyphens; starts with a letter or a digit.
 *
 * One character is enough. It used to demand two, which put this validator at
 * odds with `slugify` — a form called "A" produced the slug `a`, which the
 * database accepted and this function then called unusable. Two halves of the
 * same rule disagreeing is worse than either rule.
 */
export function isUsableSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
}

/** The value if it is a usable address, otherwise "". */
export function usableSlug(value: string): string {
  return isUsableSlug(value) ? value : "";
}

/**
 * An address for something whose name gives us nothing to work with.
 *
 * A name with no ASCII letters or digits at all — "日本レース", "!!!" — slugifies
 * to the empty string, which is not NULL, so the first such row saved happily
 * with a broken address and every one after it collided with it. Anything
 * unguessable is better than that; the admin can rename it, and the editor
 * shows the address it was given.
 */
export function fallbackSlug(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─────────────────────────── Who holds one ─────────────────────────── */

/** The things that publish at an address. Decides which table is asked. */
export type SlugKind = "article" | "event";

/**
 * Whatever already answers to an address.
 *
 * The distinction is the whole point of this type. A CURRENT address is where
 * something lives right now — taking it would leave that thing with nowhere to
 * be, so the editor refuses and says which one to go and rename. A FORMER
 * address is only a line in a redirect history, which is a thing one record can
 * hand to another: the old link stops correcting itself to the old owner and
 * starts opening the new one, which is exactly what somebody reusing an address
 * means to happen.
 */
export type SlugHolder = {
  id: string;
  name: string;
  held: "current" | "former";
};

/**
 * What the address box is told while it is being typed in.
 *
 * `invalid` is separate from `taken` because they need different sentences: one
 * is "that is not an address", the other is "that address is somebody else's".
 */
export type SlugCheck =
  | { status: "free" }
  | { status: "invalid" }
  | { status: "taken"; holder: SlugHolder };
