-- 0005 · the page keys become a table, and an admin's scope becomes rows
--
-- `admins.pages` is a JSONB array of page keys — which editors a `pages` admin
-- may open. Four possible keys, a handful of admins: a join table, and the
-- `page_key` foreign keys the rest of this phase wants become real rather than
-- a convention policed by `oneOf` on the way out.
--
-- ── Why the lookup table is here and not in 0006 ──────────────────────────
--
-- The plan puts `ctr.pages` with the page sections, which is where it is mostly
-- used. It is created here because this is the first migration that needs it:
-- an admin's scope points at a page key, and a foreign key cannot point at a
-- table that does not exist yet.
--
-- It holds FOUR keys and not two. `landing` and `incrc` are the pages with a
-- document; `circuits` and `decks` are editors over tables. All four are things
-- an admin can be scoped to (PAGE_KEYS, src/lib/roles.ts) — which is what this
-- table is a lookup for. That page_sections will only ever have rows for the
-- first two is a fact about content, not a constraint worth writing down twice.
--
-- ── The one thing to notice in the data ───────────────────────────────────
--
-- Every admin's `pages` is `[]` today, including `naveen`, who has role `pages`.
-- A page editor scoped to nothing can sign in and reach no editor at all. This
-- migration copies that faithfully — it is not the place to invent an access
-- grant — but it is worth someone looking at the Accounts screen afterwards.

CREATE TABLE ctr.pages (
  key        text PRIMARY KEY,
  name       text NOT NULL,
  /* The order the admin lists them in. */
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO ctr.pages (key, name, sort_order) VALUES
  ('landing',  'Landing page', 10),
  ('incrc',    'INCRC',        20),
  ('circuits', 'Circuits',     30),
  ('decks',    'Decks',        40);

CREATE TABLE ctr.admin_pages (
  admin_id uuid NOT NULL REFERENCES ctr.admins(id) ON DELETE CASCADE,
  page_key text NOT NULL REFERENCES ctr.pages(key) ON DELETE CASCADE,

  PRIMARY KEY (admin_id, page_key)
);

/*
 * Unknown keys are dropped rather than carried, which is what `normalisePages`
 * already does on read — a retired page key stops being an access grant the
 * moment it stops being a page, with no migration.
 */
INSERT INTO ctr.admin_pages (admin_id, page_key)
SELECT DISTINCT a.id, page.value #>> '{}'
  FROM ctr.admins a, jsonb_array_elements(a.pages) AS page(value)
 WHERE jsonb_typeof(page.value) = 'string'
   AND page.value #>> '{}' IN (SELECT key FROM ctr.pages);

DO $$
DECLARE
  held   int;
  landed int;
BEGIN
  SELECT coalesce(sum(jsonb_array_length(pages)), 0) INTO held FROM ctr.admins;
  SELECT count(*) INTO landed FROM ctr.admin_pages;

  RAISE NOTICE 'admin page grants: % in the documents, % as rows.', held, landed;

  IF landed > held THEN
    RAISE EXCEPTION 'More grants came out than went in (% > %).', landed, held;
  END IF;
END $$;
