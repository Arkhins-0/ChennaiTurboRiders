-- 0023 · an article has a category, a byline and tags
--
-- The article this deployment inherited carries a title, a line under it, a
-- cover and a body. The pages that draw one carry three things more: a category
-- chip over the cover, "by <somebody>" beside the date, and a row of tags at the
-- foot of the piece. They were in the static JSON the site read before the
-- console existed, and dropping them to fit the schema would have meant
-- redesigning two working pages around a limitation of the editor.
--
-- So the schema takes them. All three are the article's own — nothing else joins
-- to them and nothing else reads them — which is what makes them columns here
-- rather than a table of their own.
--
-- ── Why `tags` is jsonb and not a table ───────────────────────────────────
--
-- A tag on this site is a word printed under an article. Nothing filters by one,
-- nothing lists them, and no page exists at /tags/<anything>. A join table would
-- buy the ability to answer "every article tagged X" — a question nothing asks —
-- at the cost of a second write on every save and a join on every read.
--
-- `former_slugs` is already read out of `ctr.slugs` as a jsonb array and handed
-- to the same normaliser (`lines`), so the shape is one the rest of the file
-- already speaks. If a tag ever needs a page of its own, that is the migration
-- that promotes it — and it will have real usage to build the table from.
--
-- ── Defaults, and why NOT NULL ────────────────────────────────────────────
--
-- Every existing row gets '' and '[]', which is what the normaliser produces for
-- an absent field anyway — so a row written before this migration and a row
-- saved with the fields left blank are indistinguishable, which is correct: both
-- mean "not said". NOT NULL keeps `hydrate` from having to decide what a null
-- category means, a question with no useful answer.

ALTER TABLE ctr.articles
  ADD COLUMN IF NOT EXISTS category text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS author   text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags     jsonb NOT NULL DEFAULT '[]'::jsonb;

/*
 * A tag list is an ARRAY of strings, and the check says so.
 *
 * `jsonb` with a default of '[]' still accepts an object or a bare number from
 * anything that writes SQL directly, and `lines()` would turn either into [] on
 * the way out — silently, so the row would read as "no tags" for ever without
 * anybody being told the write was wrong. The constraint makes that a failed
 * write instead.
 */
ALTER TABLE ctr.articles
  ADD CONSTRAINT articles_tags_is_array
  CHECK (jsonb_typeof(tags) = 'array');
