-- 0001 · baseline: the ctr schema
--
-- Where the schema came from
-- ──────────────────────────
-- Everything up to here was scripts/schema.mjs: 846 lines of CREATE TABLE IF NOT
-- EXISTS and ADD COLUMN IF NOT EXISTS with data backfills interleaved, re-run in
-- full on every deploy, with no version anywhere. It could not add a CHECK
-- constraint at all, because Postgres has no ADD CONSTRAINT IF NOT EXISTS and
-- that file had no way of knowing whether it had run before. So `role`, `status`
-- and `page_key` were policed only in TypeScript.
--
-- This file is that file's replacement and the last one that will ever have to
-- think about what came before it. From 0002 onwards a migration may simply
-- assume the state its predecessor left.
--
-- What it does
-- ────────────
-- 1. Adopts the ten legacy public.ctr_* tables into a `ctr` schema, dropping the
--    prefix. Both steps are catalogue-only — no data is read, copied or moved,
--    whatever the row counts are.
-- 2. Creates those same ten tables from nothing, for a database that has never
--    seen schema.mjs. Exactly one of these two paths does anything.
-- 3. Adds the constraints the old file could never add.
-- 4. Carries across the two data backfills that were embedded in migrate() and
--    the one that ran after it. All three are verified already applied against
--    production (14 August 2026) and are here for any database that is not it.
-- 5. Sets search_path on the database, so `FROM sports` resolves.
--
-- Why a schema and not the prefix
-- ───────────────────────────────
-- The prefix's stated purpose was to let this database be shared with another
-- CTR site without a collision. That intent is right and a schema is the
-- mechanism Postgres provides for it: the isolation is real rather than a naming
-- convention, `search_path` gives the short names back, and `ctr.sports` is
-- available whenever being explicit is clearer.

CREATE SCHEMA IF NOT EXISTS ctr;

-- ── 1 · Adopt what is already here ──────────────────────────────────────────
--
-- Guarded on both ends: the legacy table has to exist and the clean name must
-- not, so this runs once and is inert on a database that has already been
-- through it or has never held the old names.

DO $$
DECLARE
  legacy text;
  clean  text;
BEGIN
  FOREACH legacy IN ARRAY ARRAY[
    'ctr_admins', 'ctr_sessions', 'ctr_sports', 'ctr_tracks', 'ctr_content',
    'ctr_forms', 'ctr_form_entries', 'ctr_form_nonces', 'ctr_decks', 'ctr_enquiries'
  ] LOOP
    clean := substr(legacy, 5);

    IF to_regclass('public.' || quote_ident(legacy)) IS NOT NULL
       AND to_regclass('ctr.' || quote_ident(clean)) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA ctr', legacy);
      EXECUTE format('ALTER TABLE ctr.%I RENAME TO %I', legacy, clean);
    END IF;
  END LOOP;
END $$;

-- Indexes and constraints travel with their table and keep their old names, so
-- an adopted database would end up with ctr.admins holding a ctr_admins_pkey —
-- which is the drift this phase exists to remove. Strip the prefix from those
-- too, so an adopted database and a freshly created one are indistinguishable.
--
-- Constraints first: renaming a constraint renames the index underneath it, so
-- doing the indexes first would leave the two disagreeing.

DO $$
DECLARE row record;
BEGIN
  FOR row IN
    SELECT c.conrelid::regclass::text AS table_name, c.conname AS name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relnamespace = 'ctr'::regnamespace
       AND c.conname LIKE 'ctr\_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s RENAME CONSTRAINT %I TO %I', row.table_name, row.name, substr(row.name, 5)
    );
  END LOOP;

  FOR row IN
    SELECT i.indexname AS name
      FROM pg_indexes i
     WHERE i.schemaname = 'ctr'
       AND i.indexname LIKE 'ctr\_%'
       -- The ones a constraint owns were just renamed with it.
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint c
           JOIN pg_class ic ON ic.oid = c.conindid
          WHERE ic.relname = i.indexname AND ic.relnamespace = 'ctr'::regnamespace
       )
  LOOP
    EXECUTE format('ALTER INDEX ctr.%I RENAME TO %I', row.name, substr(row.name, 5));
  END LOOP;
END $$;

-- ── 2 · Create what is not ──────────────────────────────────────────────────
--
-- The whole schema in its final shape, for a database starting from nothing. On
-- an adopted one every statement here is skipped: the tables exist. The column
-- catch-up below it is what closes the gap for a database created by an older
-- schema.mjs than the last one.

/*
 * An account. Three roles, dividing the admin by the thing being edited rather
 * than by a list of permissions: `owner` has everything including the accounts,
 * `pages` has only the page editors named in `pages`, and `registrations` has
 * only the forms and their entries.
 *
 * The default is the least privileged of the three, so an account created
 * without a role named cannot be the most powerful one by accident.
 */
CREATE TABLE IF NOT EXISTS ctr.admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'pages',
  pages         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ctr.sessions (
  token_hash text PRIMARY KEY,
  admin_id   uuid NOT NULL REFERENCES ctr.admins(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A column per field rather than a JSON document: the shape is flat, it is
-- small, and ordering the cards is a plain ORDER BY.
CREATE TABLE IF NOT EXISTS ctr.sports (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  text       text NOT NULL DEFAULT '',
  details    text NOT NULL DEFAULT '',
  logo_url   text NOT NULL DEFAULT '',
  photo_url  text NOT NULL DEFAULT '',
  -- Empty means the card is not a link at all, which is the right default for a
  -- sport with no page of its own yet.
  href       text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/*
 * The circuits, and the circuit's own record in the shape a motorsport reference
 * keeps it. A track outlives the season that visits it, so it is a table and the
 * calendar points at a row here rather than repeating it.
 *
 * Every field of the record is text, including the years and the lap time. A
 * circuit opened in "1990" but also in "2010 (rebuilt)", and a lap record is
 * "1:30.323". `races_held` is the exception and is a real count, because that is
 * a number someone will want to sum one day.
 *
 * `website` is dead — the links backfill below moved it into `links` and nothing
 * reads it. It stays until 0004, which is the migration that also gives this
 * table a slug and turns `links` into rows.
 */
CREATE TABLE IF NOT EXISTS ctr.tracks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  location        text NOT NULL DEFAULT '',
  photo_url       text NOT NULL DEFAULT '',
  map_url         text NOT NULL DEFAULT '',
  svg_path        text NOT NULL DEFAULT '',
  svg_view_box    text NOT NULL DEFAULT '',
  length          text NOT NULL DEFAULT '',
  turns           text NOT NULL DEFAULT '',
  direction       text NOT NULL DEFAULT '',
  opened          text NOT NULL DEFAULT '',
  broke_ground    text NOT NULL DEFAULT '',
  former_names    text NOT NULL DEFAULT '',
  owner           text NOT NULL DEFAULT '',
  fia_grade       text NOT NULL DEFAULT '',
  coordinates     text NOT NULL DEFAULT '',
  capacity        text NOT NULL DEFAULT '',
  website         text NOT NULL DEFAULT '',
  major_events    text NOT NULL DEFAULT '',
  lap_record_time text NOT NULL DEFAULT '',
  lap_record_year text NOT NULL DEFAULT '',
  races_held      integer NOT NULL DEFAULT 0,
  links           jsonb NOT NULL DEFAULT '[]'::jsonb,
  note            text NOT NULL DEFAULT '',
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Every word and picture on a page except the sports cards, as one JSONB
-- document per page. 0006 takes this apart into a row per section; until then it
-- is two rows, `landing` and `incrc`.
CREATE TABLE IF NOT EXISTS ctr.content (
  key        text PRIMARY KEY,
  content    jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

/*
 * A registration form. The flat parts are columns and the questions are JSONB,
 * which is the same split the tracks table makes for its links: a shape that
 * never changes is a column, and a list whose entries are invented by whoever is
 * editing is a document.
 *
 * `slug` is stored rather than derived, and `former_slugs` carries every address
 * it has ever had, because a form's address is printed on a poster and put
 * behind a QR code — it has to survive a rename. 0002 moves both into ctr.slugs.
 *
 * Null means no bound on the window: no opening date is "as soon as it is
 * published", no closing date is "until somebody closes it", and zero places is
 * unlimited.
 */
CREATE TABLE IF NOT EXISTS ctr.forms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  page_key      text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'draft',
  blurb         text NOT NULL DEFAULT '',
  intro_title   text NOT NULL DEFAULT '',
  intro_body    text NOT NULL DEFAULT '',
  submit_label  text NOT NULL DEFAULT 'Send',
  success_title text NOT NULL DEFAULT '',
  success_body  text NOT NULL DEFAULT '',
  closed_note   text NOT NULL DEFAULT '',
  notify_to     text NOT NULL DEFAULT '',
  fields        jsonb NOT NULL DEFAULT '[]'::jsonb,
  sections      jsonb NOT NULL DEFAULT '[]'::jsonb,
  former_slugs  jsonb NOT NULL DEFAULT '[]'::jsonb,
  opens_at      timestamptz,
  closes_at     timestamptz,
  max_entries   integer NOT NULL DEFAULT 0,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

/*
 * One submission. `answers` is keyed by FIELD ID, never by label: a label is
 * edited freely and an entry has to keep meaning what it meant when it was sent.
 *
 * The ip and the user agent are kept for one purpose — telling a burst of spam
 * from a busy afternoon. They are never shown on the public site, never in the
 * default export, and go with the form when it is deleted.
 */
CREATE TABLE IF NOT EXISTS ctr.form_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id    uuid NOT NULL REFERENCES ctr.forms(id) ON DELETE CASCADE,
  answers    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

/*
 * Nonces that have been spent. A row here is "this one has been used": the
 * primary key does the work, so two requests carrying the same nonce race to
 * insert it and exactly one wins, across however many instances are running.
 */
CREATE TABLE IF NOT EXISTS ctr.form_nonces (
  nonce      text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

/*
 * A deck: a run of images published at an address of its own. A row rather than
 * a section of a page, because a deck belongs to nobody — it exists at
 * /deck/<slug> whether or not anything links to it, which is what makes it
 * something you can hand to a partner.
 */
CREATE TABLE IF NOT EXISTS ctr.decks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'draft',
  blurb        text NOT NULL DEFAULT '',
  show_heading boolean NOT NULL DEFAULT true,
  pages        jsonb NOT NULL DEFAULT '[]'::jsonb,
  former_slugs jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- A message sent from the footer. Its own table rather than a form with three
-- questions: an entry belongs to a form and is read on that form's screen, while
-- this belongs to nobody and arrives from every page on the site.
CREATE TABLE IF NOT EXISTS ctr.enquiries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  message    text NOT NULL,
  handled    boolean NOT NULL DEFAULT false,
  ip         text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Columns schema.mjs added after its own CREATE TABLE statements. A database
-- adopted above from the last version of that file already has every one; this
-- is for one adopted from an earlier version, and it is what makes the two
-- paths above meet at the same schema rather than merely near it.
ALTER TABLE ctr.admins       ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'pages';
ALTER TABLE ctr.admins       ADD COLUMN IF NOT EXISTS pages jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ctr.sports       ADD COLUMN IF NOT EXISTS photo_url text NOT NULL DEFAULT '';
ALTER TABLE ctr.sports       ADD COLUMN IF NOT EXISTS href text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS photo_url text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS svg_path text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS svg_view_box text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS former_names text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS fia_grade text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS opened text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS broke_ground text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS coordinates text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS capacity text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS website text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS major_events text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS lap_record_time text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS lap_record_year text NOT NULL DEFAULT '';
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS races_held integer NOT NULL DEFAULT 0;
ALTER TABLE ctr.tracks       ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ctr.forms        ADD COLUMN IF NOT EXISTS opens_at timestamptz;
ALTER TABLE ctr.forms        ADD COLUMN IF NOT EXISTS closes_at timestamptz;
ALTER TABLE ctr.forms        ADD COLUMN IF NOT EXISTS max_entries integer NOT NULL DEFAULT 0;
ALTER TABLE ctr.forms        ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The role default started at 'owner', which WAS the backfill: every account
-- that existed before roles did kept exactly the access it had, so a deploy
-- could not lock anyone out. New accounts get the least privileged role.
ALTER TABLE ctr.admins ALTER COLUMN role SET DEFAULT 'pages';

CREATE INDEX IF NOT EXISTS sports_order_idx       ON ctr.sports (sort_order, title);
CREATE INDEX IF NOT EXISTS tracks_order_idx       ON ctr.tracks (sort_order, name);
CREATE INDEX IF NOT EXISTS decks_order_idx        ON ctr.decks (sort_order, name);
CREATE INDEX IF NOT EXISTS forms_page_idx         ON ctr.forms (page_key, sort_order, name);
CREATE INDEX IF NOT EXISTS form_entries_form_idx  ON ctr.form_entries (form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS form_nonces_expiry_idx ON ctr.form_nonces (expires_at);
CREATE INDEX IF NOT EXISTS enquiries_recent_idx   ON ctr.enquiries (created_at DESC);

-- ── 3 · The constraints the old file could not add ──────────────────────────
--
-- Dropped and re-added rather than added: Postgres has no ADD CONSTRAINT IF NOT
-- EXISTS, and this is the idiom that is idempotent without one. The tables are
-- tens of rows, so the validation scan is free.
--
-- These do not replace the `oneOf` calls the values already go through on the
-- way out of the database. Those keep a retired role from being a migration;
-- these keep a value the application never produces from being in here at all —
-- a bad write, a hand-run UPDATE, a restore from somewhere else.
--
-- Verified against live data before being written: role is owner ×3 / pages ×1,
-- form status is open ×1, form page_key is incrc ×1, deck status is published ×3
-- / draft ×1, content keys are landing and incrc. Nothing here rejects a row
-- that exists.

ALTER TABLE ctr.admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE ctr.admins  ADD CONSTRAINT admins_role_check
  CHECK (role IN ('owner', 'pages', 'registrations'));

ALTER TABLE ctr.admins DROP CONSTRAINT IF EXISTS admins_pages_is_array;
ALTER TABLE ctr.admins  ADD CONSTRAINT admins_pages_is_array
  CHECK (jsonb_typeof(pages) = 'array');

ALTER TABLE ctr.content DROP CONSTRAINT IF EXISTS content_key_check;
ALTER TABLE ctr.content  ADD CONSTRAINT content_key_check
  CHECK (key IN ('landing', 'incrc'));

ALTER TABLE ctr.content DROP CONSTRAINT IF EXISTS content_is_object;
ALTER TABLE ctr.content  ADD CONSTRAINT content_is_object
  CHECK (jsonb_typeof(content) = 'object');

ALTER TABLE ctr.forms DROP CONSTRAINT IF EXISTS forms_status_check;
ALTER TABLE ctr.forms  ADD CONSTRAINT forms_status_check
  CHECK (status IN ('draft', 'open', 'closed'));

-- '' is a form that belongs to no page yet, which is the column's own default.
ALTER TABLE ctr.forms DROP CONSTRAINT IF EXISTS forms_page_key_check;
ALTER TABLE ctr.forms  ADD CONSTRAINT forms_page_key_check
  CHECK (page_key IN ('', 'landing', 'incrc'));

ALTER TABLE ctr.forms DROP CONSTRAINT IF EXISTS forms_documents_are_arrays;
ALTER TABLE ctr.forms  ADD CONSTRAINT forms_documents_are_arrays
  CHECK (
    jsonb_typeof(fields) = 'array'
    AND jsonb_typeof(sections) = 'array'
    AND jsonb_typeof(former_slugs) = 'array'
  );

ALTER TABLE ctr.form_entries DROP CONSTRAINT IF EXISTS form_entries_answers_is_object;
ALTER TABLE ctr.form_entries  ADD CONSTRAINT form_entries_answers_is_object
  CHECK (jsonb_typeof(answers) = 'object');

ALTER TABLE ctr.decks DROP CONSTRAINT IF EXISTS decks_status_check;
ALTER TABLE ctr.decks  ADD CONSTRAINT decks_status_check
  CHECK (status IN ('draft', 'published'));

ALTER TABLE ctr.decks DROP CONSTRAINT IF EXISTS decks_documents_are_arrays;
ALTER TABLE ctr.decks  ADD CONSTRAINT decks_documents_are_arrays
  CHECK (jsonb_typeof(pages) = 'array' AND jsonb_typeof(former_slugs) = 'array');

ALTER TABLE ctr.tracks DROP CONSTRAINT IF EXISTS tracks_links_is_array;
ALTER TABLE ctr.tracks  ADD CONSTRAINT tracks_links_is_array
  CHECK (jsonb_typeof(links) = 'array');

-- ── 4 · The backfills that were embedded in the old file ────────────────────
--
-- Every one is a no-op against production, verified on 14 August 2026 — 0 rows
-- outstanding on all three. They are carried anyway, because a database that has
-- not had them applied would otherwise be silently wrong rather than loudly
-- behind, and after this file there is nowhere else for them to live.
--
-- The fourth, backfillRoundDates, is not here: it parses "11-13 September 2026"
-- out of a printed sentence, which is JavaScript rather than SQL. It is verified
-- applied — all four INCRC calendar rounds carry start, end and a track id — and
-- 0006 turns those rounds into real columns, which retires the question.

-- The old single `website` became the first related link. Only fires on a
-- circuit whose list is still empty, so it cannot duplicate one already added.
UPDATE ctr.tracks
   SET links = jsonb_build_array(jsonb_build_object('label', 'Official site', 'href', website)),
       updated_at = now()
 WHERE links = '[]'::jsonb AND website <> '';

-- map_url held photographs before there was a column for them. Only ever fills a
-- blank photo_url, so it cannot overwrite a picture someone has since chosen.
UPDATE ctr.tracks
   SET photo_url = map_url, map_url = '', updated_at = now()
 WHERE photo_url = '' AND map_url <> '';

-- Entry forms are pages on this site now, so nothing about registering should
-- send a visitor to the older CTR site. Only ever touches a link to that host;
-- an address somebody has since chosen is left exactly as it is.
UPDATE ctr.content
   SET content = jsonb_set(content, '{register,ctaHref}', '"#registrations"'),
       updated_at = now()
 WHERE key = 'incrc'
   AND content->'register'->>'ctaHref' LIKE 'https://chennaiturboriders.in%';

-- ── 5 · search_path ─────────────────────────────────────────────────────────
--
-- On the DATABASE, not on the session. The app talks to Neon over HTTP, where
-- every query is its own connection and a `SET search_path` would be forgotten
-- before the next one — so a per-session setting cannot work here, and the
-- default has to be attached to something that outlives the connection.
--
-- `ctr, public` and not `ctr` alone: public keeps extensions and anything else
-- that lives there resolving. New unqualified objects are created in ctr, which
-- is the first entry and the right home for them.
--
-- New sessions only. The connection running this migration keeps the search_path
-- it started with, which is why every statement above is schema-qualified.

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = ctr, public', current_database());
EXCEPTION WHEN insufficient_privilege THEN
  -- Not the database owner. The role's own default is the next best thing and
  -- covers every connection this application makes.
  EXECUTE format('ALTER ROLE %I SET search_path = ctr, public', current_user);
  RAISE NOTICE 'Set search_path on role % — no permission to set it on the database.', current_user;
END $$;
