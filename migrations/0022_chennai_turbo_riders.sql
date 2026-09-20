-- 0022 · this deployment is one site, and the site is Chennai Turbo Riders
--
-- 0012 created two sites, because the deployment it was written for serves two:
-- `landing`, the root, at `/`, and `incrc`, a sport, at `/incrc`. That shape is
-- right for CTR Unified and wrong here. This installation answers on one domain
-- for one team, so there is one site, it is the root, and it is served at `/`.
--
-- ── Why the root site rather than a second sport ──────────────────────────
--
-- The obvious alternative is to keep `landing` as a hub and add `f4` beneath it.
-- That would put every page of this site one segment down — /f4/articles for a
-- domain whose entire subject is the F4 team — and would leave a root page with
-- nothing on it but a link to the only child. `kind = 'root'` is what makes a
-- site's pages hang off `/`, so the team IS the root site.
--
-- The name is the only thing that changes. The slug stays `landing`: it is a
-- key, not a label — `sportSiteId()` in the seed, `getRootSite()` and every
-- `page_key` in scripts/seed-data read it, and renaming a key to match a display
-- string buys nothing and breaks all three.
--
-- ── Modules ───────────────────────────────────────────────────────────────
--
-- 0012 gave the root site `forms` and `articles`, on the reasoning that a hub
-- page has no calendar and no circuits of its own. This root site is a racing
-- team, so it has all five: a season, the circuits it runs on, its decks, its
-- articles and its entry forms.
--
-- A module is a feature switched ON, not a permission — an absent row is what
-- makes /circuits 404 rather than render empty, so adding them here is what puts
-- those screens in the console's sidebar at all.
--
-- ── Deleting INCRC ────────────────────────────────────────────────────────
--
-- It is another organisation's championship and it is not on this domain. Left
-- in place it would be a site in the console's switcher that nobody here can
-- publish, and a second set of articles and circuits to mistake for this team's.
--
-- The delete cascades — 0012 declared every child of `sites` ON DELETE CASCADE —
-- so its modules, pages, sections and grants go with it. On a new database it
-- has none of those yet: migrations run before `db:seed`, so this removes an
-- empty row, and the seed then finds no site for `incrc.json` and says so
-- ("no home page for the site \"incrc\" — skipped."), which is the intended path
-- and not an error. `sportSiteId()` documents the same fallback: with INCRC
-- gone, the circuits, decks and events seed into the root site — this one.

/* ─────────────────────────── The site's own name ─────────────────────────── */

UPDATE ctr.sites
   SET name = 'Chennai Turbo Riders'
 WHERE slug = 'landing';

/* ──────────────────────────── What it has ────────────────────────────────── */

/*
 * Every module, for the root site. ON CONFLICT DO NOTHING because 0012 already
 * gave it `forms` and `articles` — this adds the three it lacked and re-states
 * the two it had, so the statement is the whole list rather than the difference,
 * and reads as "these are the modules" instead of "these are the ones added in
 * August".
 */
INSERT INTO ctr.site_modules (site_id, module)
SELECT s.id, m.module
  FROM ctr.sites s
  JOIN (VALUES ('decks'), ('forms'), ('articles'), ('events'), ('circuits'))
       AS m(module) ON true
 WHERE s.slug = 'landing'
    ON CONFLICT DO NOTHING;

/* ─────────────────────────── The site that is not ────────────────────────── */

DELETE FROM ctr.sites WHERE slug = 'incrc';
