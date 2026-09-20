-- 0010 · articles — the first thing on this site that is written rather than filled in
--
-- Every editor before this one edits a FIXED LAYOUT: named slots, a picture here,
-- a line of copy there. The landing document has a hero and a marquee and a
-- partners strip, and what an editor does is fill them. Nothing in the project
-- lets anybody simply write — the longest field is a `textarea` capped at 3000
-- characters and the only formatting available is a blank line.
--
-- An article is the other thing. It has a title, a line under it, a picture at the
-- top and then however many paragraphs somebody needs, with their own emphasis and
-- their own pictures in the middle of them.
--
-- ── Why it is a row, and not a section of a page ──────────────────────────
--
-- The same reasoning `ctr.decks` was built on, recorded at the top of
-- src/lib/decks.ts: it is published at `/articles/<slug>` whether or not anything
-- links to it. That is what makes it something you can print on a poster or point
-- three different pages at without copying it three times. A section belongs to
-- the page it is on and moving it means editing that page's document.
--
-- ── Why page_key is NULLABLE, and why NULL is the STRICT value ────────────
--
-- An article belongs to one page — the INCRC page's editors write the INCRC
-- articles — except when it belongs to all of them, which is the owner writing
-- for the whole site. That second case has no page key to carry, so it carries
-- none.
--
-- NULL therefore means "every page", and the guard reads it as OWNER ONLY. This
-- is the same reading `canOverrideUsage` already applies to a media reference
-- whose page is null (src/lib/mediaPaths.ts): a thing belonging to no page in
-- particular can only be judged by the account that can see every page it might
-- affect. Unknown means stricter, never looser — the posture `normaliseRole`
-- takes, and the one this column takes too.
--
-- Note what is deliberately NOT here: no `articles` entry in PAGE_KEYS. Articles
-- are scoped BY the four pages, not alongside them, so there is no fifth key and
-- no fifth grant for an owner to remember to tick.

/*
 * The lookup row, so page_key can carry a real foreign key.
 *
 * `sort_order` 50 puts it after decks. This row exists for the FK and for
 * PAGE_LABELS-style completeness; nothing grants an admin the 'articles' page,
 * because src/lib/roles.ts does not list it as a PageKey. A row in ctr.admin_pages
 * naming it would be dropped by `normalisePageKeys` on the way into the session.
 */
INSERT INTO ctr.pages (key, name, sort_order) VALUES ('articles', 'Articles', 50);

CREATE TABLE ctr.articles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /* NULL is every page, and only an owner may write one. See the note above. */
  page_key    text REFERENCES ctr.pages(key) ON DELETE CASCADE,

  title       text NOT NULL DEFAULT '',
  /* The line under the title, and what a card linking to it says. */
  subtext     text NOT NULL DEFAULT '',
  cover_image text NOT NULL DEFAULT '',

  /*
   * The body, as a ProseMirror document.
   *
   * JSONB rather than HTML on purpose. HTML would make this the first place in
   * the project where untrusted markup reaches the DOM, and it would need a
   * sanitiser to be safe. A document is a tree of typed nodes, so the renderer is
   * a switch over a CLOSED set of them and anything it does not recognise is
   * skipped — there is no payload to sanitise because there is no markup.
   *
   * Read through `normaliseArticleBody` on the way in AND on the way out, like
   * every other JSONB column here, so a document written by a future version
   * degrades one node at a time rather than taking the page down.
   *
   * It also means an image key sits in this column as plain text, exactly as it
   * does in `page_sections.data` — which is what lets the existing media usage
   * scan find it with the mechanism it already has.
   */
  body        jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,

  /*
   * Draft or published, and nothing in between — the deck's reasoning, not the
   * form's. An article only shows; there is no equivalent of "closed".
   */
  status      text NOT NULL DEFAULT 'draft',

  /* Printed under the title. Never parsed for ordering; see sort_order. */
  published_at date,

  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT articles_status_check CHECK (status IN ('draft', 'published'))
);

/* The admin screen's list, which is always "this account's pages, in order". */
CREATE INDEX articles_page_idx ON ctr.articles (page_key, sort_order);

/* The public index, which is always the published ones. */
CREATE INDEX articles_published_idx ON ctr.articles (status, sort_order);

/*
 * ── Teaching ctr.slugs about a third kind ────────────────────────────────
 *
 * 0002 pinned `entity_type` to the two things that published at an address then.
 * An article is the third, and without this every save fails on the check
 * constraint rather than anywhere useful.
 */
ALTER TABLE ctr.slugs DROP CONSTRAINT slugs_entity_type_check;
ALTER TABLE ctr.slugs ADD  CONSTRAINT slugs_entity_type_check
  CHECK (entity_type IN ('deck', 'form', 'article'));

/*
 * And the trigger that cleans them up.
 *
 * ctr.slugs cannot carry a foreign key — its entity_id points at one of three
 * tables now, depending on entity_type — so the DELETE half of what a foreign key
 * would do is a trigger instead. Without it, deleting an article leaves its
 * addresses behind to block the next thing that wants one, which surfaces months
 * later as "that slug is taken" pointing at nothing. The function is the one 0002
 * already defined.
 */
CREATE TRIGGER articles_forget_slugs AFTER DELETE ON ctr.articles
  FOR EACH ROW EXECUTE FUNCTION ctr.forget_slugs('article');
