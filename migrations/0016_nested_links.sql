-- 0016 · every stored link learns which sport it belongs to
--
-- The public routes move under the sport in this phase: `/deck/entry-pack`
-- becomes `/incrc/deck/entry-pack`, and the old address is dropped rather than
-- redirected — the decision recorded in docs/multi-sport.md.
--
-- Links that live in CODE move with the code. Links that were RESOLVED and
-- STORED do not, and there are a lot of places to store one: a banner's button,
-- a bulletin row, a chip under a quote, a link inside an article's body, a
-- circuit's related-links list. Every one of them holds a path somebody chose
-- from a picker, and every one of them would 404 on the deploy that moves the
-- routes.
--
-- ── Why a path and not an id ──────────────────────────────────────────────
--
-- Because the documents these live in are normalised in the BROWSER as well as
-- on the server, where nothing can be looked up. `FormPicker` argues this at
-- length. What it costs is exactly this migration, which is the bill coming due
-- once.
--
-- ── What counts as a link ─────────────────────────────────────────────────
--
-- A string that is ENTIRELY one of the four flat routes, optionally with a
-- fragment or query after it:
--
--     /deck            /deck/entry-pack        /articles/one#top
--     /register        /register/entry         /circuits?from=home
--     /articles        /articles/one
--     /circuits        /circuits/kari-motor-speedway
--
-- Anchored at both ends, which is what makes this safe to run over whole
-- documents. The circuits' photographs are
-- `https://raw.githubusercontent.com/…/circuits/map1.webp` — they CONTAIN
-- `/circuits/map1.webp` and are not links, and an unanchored replace would have
-- broken all six of them. The slug pattern also refuses a dot, so even a
-- root-relative `/circuits/map1.webp` would survive.
--
-- A string that is exactly `/circuits` and is meant as prose rather than a link
-- would be rewritten. That is a trade nobody will ever notice, and the
-- alternative — naming every key that holds an href, in every section type — is
-- a list that rots the first time somebody adds a section.
--
-- ── Which sport's prefix ──────────────────────────────────────────────────
--
-- The one that OWNS THE TARGET, not the one the link sits on. A banner on the
-- landing page pointing at an INCRC entry form has to end up at
-- `/incrc/register/…`, because that is where the form is served. The owner is
-- looked up in `ctr.slugs` (decks, forms, articles) or `ctr.tracks` (circuits).
--
-- An index route names no target, and a slug that resolves to nothing is a link
-- that was already broken. Both fall back to the site the link is stored on,
-- which is the best guess available and leaves a broken link broken rather than
-- pointing it somewhere new.

/* ────────────────────────── One link at a time ──────────────────────────── */

CREATE FUNCTION ctr.nest_link(href text, fallback text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  route  text;
  /*
   * `wanted` rather than `slug`: plpgsql resolves a bare name against the
   * query's columns FIRST, and both `ctr.slugs` and `ctr.tracks` have a column
   * called `slug` — so a local of that name makes `WHERE t.slug = slug` an
   * ambiguous reference rather than a comparison.
   */
  wanted text;
  tail   text;
  owner  text;
BEGIN
  IF href IS NULL OR href = '' THEN RETURN href; END IF;

  /* An index: /articles, /circuits — no target to resolve. */
  route := substring(href from '^/(deck|register|articles|circuits)(?:[#?].*)?$');
  IF route IS NOT NULL THEN RETURN fallback || href; END IF;

  route := substring(href from '^/(deck|register|articles|circuits)/[a-z0-9][a-z0-9-]*(?:[#?].*)?$');
  IF route IS NULL THEN RETURN href; END IF;

  wanted := substring(href from '^/(?:deck|register|articles|circuits)/([a-z0-9][a-z0-9-]*)');
  tail := substring(href from '[#?].*$');

  IF route = 'circuits' THEN
    SELECT CASE WHEN s.kind = 'root' THEN '' ELSE '/' || s.slug END
      INTO owner
      FROM ctr.tracks t
      JOIN ctr.sites s ON s.id = t.site_id
     WHERE t.slug = wanted;
  ELSE
    /*
     * `ctr.slugs` holds former addresses too, and a link to one still resolves
     * — the route permanently redirects. Current first, so a slug that has been
     * handed on to another entity resolves to the live one.
     */
    SELECT CASE WHEN s.kind = 'root' THEN '' ELSE '/' || s.slug END
      INTO owner
      FROM ctr.slugs g
      JOIN ctr.sites s ON s.id = g.site_id
     WHERE g.slug = wanted
       AND g.entity_type = CASE route
                             WHEN 'deck'     THEN 'deck'
                             WHEN 'register' THEN 'form'
                             ELSE                 'article'
                           END
     ORDER BY g.is_current DESC
     LIMIT 1;
  END IF;

  RETURN coalesce(owner, fallback) || '/' || route || '/' || wanted || coalesce(tail, '');
END $$;

/* ───────────────────── Every string in a document ───────────────────────── */

CREATE FUNCTION ctr.nest_links(value jsonb, fallback text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  result jsonb;
BEGIN
  IF value IS NULL THEN RETURN value; END IF;

  CASE jsonb_typeof(value)
    WHEN 'string' THEN
      /* `#>> '{}'` is how a jsonb scalar string is read out unquoted. */
      RETURN to_jsonb(ctr.nest_link(value #>> '{}', fallback));

    WHEN 'array' THEN
      SELECT coalesce(jsonb_agg(ctr.nest_links(entry, fallback) ORDER BY ordinality), '[]'::jsonb)
        INTO result
        FROM jsonb_array_elements(value) WITH ORDINALITY AS t(entry, ordinality);
      RETURN result;

    WHEN 'object' THEN
      SELECT coalesce(jsonb_object_agg(key, ctr.nest_links(entry, fallback)), '{}'::jsonb)
        INTO result
        FROM jsonb_each(value) AS t(key, entry);
      RETURN result;

    ELSE
      RETURN value;
  END CASE;
END $$;

/* ────────────────────────────── The rewrite ─────────────────────────────── */

/* The prefix of the site a row belongs to: '' for the root, '/<slug>' for a sport. */
CREATE TEMP TABLE site_prefix ON COMMIT DROP AS
SELECT id, CASE WHEN kind = 'root' THEN '' ELSE '/' || slug END AS prefix FROM ctr.sites;

UPDATE ctr.page_sections ps
   SET data = ctr.nest_links(ps.data, sp.prefix)
  FROM ctr.pages p
  JOIN site_prefix sp ON sp.id = p.site_id
 WHERE p.id = ps.page_id
   AND ctr.nest_links(ps.data, sp.prefix) IS DISTINCT FROM ps.data;

UPDATE ctr.banners b
   SET cta_href = ctr.nest_link(b.cta_href, sp.prefix)
  FROM ctr.page_sections ps
  JOIN ctr.pages p ON p.id = ps.page_id
  JOIN site_prefix sp ON sp.id = p.site_id
 WHERE ps.id = b.section_id
   AND ctr.nest_link(b.cta_href, sp.prefix) IS DISTINCT FROM b.cta_href;

UPDATE ctr.posts x
   SET href = ctr.nest_link(x.href, sp.prefix)
  FROM ctr.page_sections ps
  JOIN ctr.pages p ON p.id = ps.page_id
  JOIN site_prefix sp ON sp.id = p.site_id
 WHERE ps.id = x.section_id
   AND ctr.nest_link(x.href, sp.prefix) IS DISTINCT FROM x.href;

UPDATE ctr.partners x
   SET href = ctr.nest_link(x.href, sp.prefix)
  FROM ctr.page_sections ps
  JOIN ctr.pages p ON p.id = ps.page_id
  JOIN site_prefix sp ON sp.id = p.site_id
 WHERE ps.id = x.section_id
   AND ctr.nest_link(x.href, sp.prefix) IS DISTINCT FROM x.href;

UPDATE ctr.track_links x
   SET href = ctr.nest_link(x.href, sp.prefix)
  FROM ctr.tracks t
  JOIN site_prefix sp ON sp.id = t.site_id
 WHERE t.id = x.track_id
   AND ctr.nest_link(x.href, sp.prefix) IS DISTINCT FROM x.href;

/* An article's body is a ProseMirror document; its links are `href` marks. */
UPDATE ctr.articles a
   SET body = ctr.nest_links(a.body, sp.prefix)
  FROM site_prefix sp
 WHERE sp.id = a.site_id
   AND ctr.nest_links(a.body, sp.prefix) IS DISTINCT FROM a.body;

/* A form's questions and its section copy can both carry one. */
UPDATE ctr.forms f
   SET fields   = ctr.nest_links(f.fields, sp.prefix),
       sections = ctr.nest_links(f.sections, sp.prefix)
  FROM site_prefix sp
 WHERE sp.id = f.site_id
   AND (ctr.nest_links(f.fields, sp.prefix)   IS DISTINCT FROM f.fields
     OR ctr.nest_links(f.sections, sp.prefix) IS DISTINCT FROM f.sections);

/*
 * `ctr.sports.href` is deliberately NOT rewritten. A sport card points at a
 * SITE — '/incrc' — and a site's own address is the one thing this phase does
 * not move. The cards that point outward hold somebody else's address, which is
 * none of our business either.
 */

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  flat int;
BEGIN
  /*
   * Nothing anywhere should still hold a bare flat route. Counted over the same
   * columns the UPDATEs above touched, with the same anchoring, so a survivor
   * means the rewrite missed a place rather than that the pattern is loose.
   */
  SELECT count(*) INTO flat FROM (
    SELECT 1 FROM ctr.page_sections
      WHERE data::text ~ '"/(deck|register|articles|circuits)(/[a-z0-9][a-z0-9-]*)?"'
    UNION ALL
    SELECT 1 FROM ctr.banners
      WHERE cta_href ~ '^/(deck|register|articles|circuits)(/[a-z0-9][a-z0-9-]*)?([#?].*)?$'
    UNION ALL
    SELECT 1 FROM ctr.posts
      WHERE href ~ '^/(deck|register|articles|circuits)(/[a-z0-9][a-z0-9-]*)?([#?].*)?$'
    UNION ALL
    SELECT 1 FROM ctr.partners
      WHERE href ~ '^/(deck|register|articles|circuits)(/[a-z0-9][a-z0-9-]*)?([#?].*)?$'
    UNION ALL
    SELECT 1 FROM ctr.track_links
      WHERE href ~ '^/(deck|register|articles|circuits)(/[a-z0-9][a-z0-9-]*)?([#?].*)?$'
    UNION ALL
    SELECT 1 FROM ctr.articles
      WHERE body::text ~ '"/(deck|register|articles|circuits)(/[a-z0-9][a-z0-9-]*)?"'
  ) x;

  IF flat > 0 THEN
    RAISE EXCEPTION '% link(s) still name a flat route. Nothing has been written.', flat;
  END IF;

  RAISE NOTICE 'every stored link now carries its sport.';
END $$;

/* Scaffolding. Nothing outside this migration calls either of them. */
DROP FUNCTION ctr.nest_links(jsonb, text);
DROP FUNCTION ctr.nest_link(text, text);
