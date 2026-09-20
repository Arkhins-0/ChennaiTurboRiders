/**
 * The one picture the code still names.
 *
 * ── What used to be here ──────────────────────────────────────────────────
 *
 * Three tables of photography — BANNER_PHOTOS, ABOUT_PHOTOS, INCRC_PHOTOS —
 * feeding DEFAULT_LANDING_CONTENT and DEFAULT_INCRC_CONTENT, which rendered
 * whenever the database had no row for a section. It always had no row: nothing
 * ever wrote one, so both pages were served from the repo while the tables that
 * were meant to hold them sat empty.
 *
 * That is fixed. The pages are rows now, seeded from scripts/seed-data/*.json,
 * and every photograph on them is a value in the database that somebody can
 * change at /console without a deploy. Those three tables were the last copy of
 * the site's content living in the source, and they are gone with the documents
 * they fed.
 *
 * ── Why anything is left ──────────────────────────────────────────────────
 *
 * `image()` in src/lib/normalise.ts must return SOMETHING for a field that is
 * blank or malformed, because an empty `src` renders as a broken image rather
 * than as nothing. That is a rendering guard, not content: it appears only where
 * a picture was cleared or never set, and it says "no photograph here" rather
 * than asserting anything about CTR.
 *
 * It is a file under /public on purpose, and the reasoning is the same one that
 * emptied this file. A placeholder served from the media bucket would be a
 * broken image in precisely the situation it exists for — the bucket renamed,
 * the policy changed, the host down. /public is served by the deployment that is
 * already answering the request, so it cannot fail separately from the page.
 */
export const PLACEHOLDER_PHOTO = "/images/hero/background.webp";
