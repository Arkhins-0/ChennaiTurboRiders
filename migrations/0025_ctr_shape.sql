-- 0025 · the console takes the shape of the site
--
-- This console arrived as a port of CTR Unified's (see 0022), and it brought
-- that platform's screens with it: a section-built landing page and its header
-- and footer (ctr.pages, ctr.page_sections and the three tables promoted out of
-- them), the sports cards (ctr.sports), the decks, the registration forms and
-- their entries, and the enquiries the platform's footer posted. Every one of
-- those had a screen, a set of routes and a seed — and not one of them was
-- drawn by this site.
--
-- ── How that came to be ───────────────────────────────────────────────────
--
-- The public pages of this site are hand-built components: a driver reel, a
-- tilted car panel, a calendar with a countdown. They never rendered a section
-- document, and the platform's page components that would have — the whole of
-- src/app/(site)/_shell — were ported but never given a route. So the console
-- had a "Landing page" screen editing a page that did not exist, a "Header and
-- footer" screen editing a header this site does not use, and it opened on the
-- first of them after every sign-in, showing CTR Unified's copy inside CTR
-- Unified's chrome. That was the first thing an admin saw.
--
-- 0024 gave this site's own content its tables and its screens. This migration
-- finishes the job from the other side: it removes everything the console
-- could edit that the site could not show.
--
-- ── What goes, and why each is safe to drop ───────────────────────────────
--
--   events.form_id           The entry-form button on an event's page. There is
--                            no event page here (the calendar is one page), and
--                            no forms after this. Dropped before ctr.forms so
--                            there is no foreign key in the way.
--   forms + entries + nonces No page ever rendered one; ctr.forms holds 0 rows.
--   decks + deck_pages       No /deck/[slug] route. The three rows are INCRC's
--                            and CTR Unified's documents, not this team's.
--   pages + page_sections    The section-built pages. Their child tables
--   + banners/posts/partners (promoted sections) cascade from page_sections.
--   sports                   Cricket, pickleball, volleyball, hockey — the
--                            platform's landing cards. Nothing here reads them.
--   enquiries                Posted to by the platform's footer, which this
--                            site does not have. 0 rows.
--   admin_capabilities       Held exactly one capability — "may read the
--                            enquiries" — and nothing else was ever defined.
--                            With the screen gone the concept is empty.
--
-- The slug registry is cleaned by hand because these tables are DROPPED, not
-- emptied: the `forget_slugs` trigger fires per deleted row and a DROP fires
-- nothing. The function itself stays — articles, events and seasons still use
-- it. Same reasoning for ctr.site_modules: a module row for a feature that no
-- longer exists would be read by `hasModule` and offered in the co-admins
-- grant picker, so it is removed rather than left to be ignored.
--
-- Nothing this site draws is touched: the team's content from 0024, the
-- articles, the seasons and their rounds, the circuits, the media library, the
-- accounts and their grants.

/* ─────────────────────────── The one cross-link ─────────────────────────── */

ALTER TABLE ctr.events DROP COLUMN form_id;

/* ────────────────────────────── The registries ──────────────────────────── */

DELETE FROM ctr.slugs WHERE entity_type IN ('deck', 'form');
DELETE FROM ctr.site_modules WHERE module IN ('decks', 'forms');
DELETE FROM ctr.admin_grants WHERE module IN ('page', 'chrome', 'decks', 'forms');

/* ─────────────────────────────── The tables ─────────────────────────────── */

DROP TABLE ctr.form_entry_files;
DROP TABLE ctr.form_entry_answers;
DROP TABLE ctr.form_entries;
DROP TABLE ctr.form_nonces;
DROP TABLE ctr.forms;

DROP TABLE ctr.deck_pages;
DROP TABLE ctr.decks;

DROP TABLE ctr.banners;
DROP TABLE ctr.posts;
DROP TABLE ctr.partners;
DROP TABLE ctr.page_sections;
DROP TABLE ctr.pages;

DROP TABLE ctr.sports;
DROP TABLE ctr.enquiries;
DROP TABLE ctr.admin_capabilities;
