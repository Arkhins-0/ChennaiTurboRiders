-- 0002 · one table for every address this site publishes
--
-- Two things here are published at an address somebody types, prints or puts
-- behind a QR code: a registration form and a deck. Both carry `slug` plus a
-- `former_slugs` JSONB array of every address they have ever answered to, and
-- both duplicate the same 80 lines of find-the-owner, release-the-old-one and
-- suffix-until-free logic (formsRepo.ts, decksRepo.ts).
--
-- The duplication is not the reason to fix it. This is:
--
--   deck                             status      slug                        former_slugs
--   New deck                         draft       new-deck                    []
--   World of CTR                     published   world-of-ctr                ["new-deck"]
--   CTR Jk Tyre INCRC                published   ctr-jk-tyre-…               ["new-deck"]
--   Sponsorship & Brand Partnership  published   sponsorship-brand-…         ["new-deck"]
--
-- Four rows claiming `new-deck` at once, in production. Every deck is created at
-- that default address and renamed, and the rename leaves a redirect behind, so
-- all three published decks believe `/deck/new-deck` is theirs. None of them
-- wins: `getDeckBySlug` puts the CURRENT holder first, and that is the empty
-- draft, which 404s for being a draft.
--
-- A unique index over (entity_type, slug) makes that state unrepresentable. It
-- is the highest-value single change in this programme, and it is four columns.
--
-- ── Resolving the collision, deliberately ─────────────────────────────────
--
-- The conductor is explicit that the migration must decide this rather than let
-- a unique violation decide it. The rule, in the order the inserts run:
--
--   1. Every CURRENT slug goes in first. Those are already unique per table —
--      the old UNIQUE(slug) constraint saw to that — so they cannot collide.
--   2. A FORMER slug goes in only if nothing has claimed it. A former address is
--      a redirect, and a redirect that fights a live address loses; the live one
--      is what somebody is using now.
--   3. Between two former claims on the same address, the older entity wins.
--      Deterministic, and it is the one that has been answering to it longest.
--
-- Applied to the table above: the draft keeps `new-deck` because it holds it
-- today, and the three dead redirects are dropped. That is what
-- docs/defaults-sync.md recommends doing by hand, done once and for all.
--
-- ── Expand, do not contract ───────────────────────────────────────────────
--
-- `decks.slug`, `decks.former_slugs`, `forms.slug` and `forms.former_slugs` are
-- NOT dropped here, and neither is anything else this phase copies. The repos
-- still read them, so dropping them now would break the site between this phase
-- and the next. The drops belong to phase 4, together with the repo rewiring
-- that stops reading them — and phase 4 must RE-RUN these backfills immediately
-- before it drops anything, because between the two phases the old columns are
-- still the ones being written.
--
-- From here on a migration may assume the state its predecessor left, so these
-- are written plainly. Only 0001 has to be idempotent, because only 0001 has to
-- cope with a database it did not create.

CREATE TABLE ctr.slugs (
  entity_type text NOT NULL,
  slug        text NOT NULL,
  entity_id   uuid NOT NULL,
  /* The address it answers to now, as opposed to one it redirects from. */
  is_current  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (entity_type, slug),
  CONSTRAINT slugs_entity_type_check CHECK (entity_type IN ('deck', 'form')),
  CONSTRAINT slugs_not_blank CHECK (slug <> '')
);

/*
 * One current address per thing. The partial index is the half that makes this
 * table a model rather than a log: an entity may have any number of former
 * addresses and exactly one live one.
 */
CREATE UNIQUE INDEX slugs_one_current_idx
  ON ctr.slugs (entity_type, entity_id) WHERE is_current;

/* Every address an entity owns, for the rename path. */
CREATE INDEX slugs_entity_idx ON ctr.slugs (entity_type, entity_id);

/*
 * There is no foreign key on entity_id, and there cannot be: it points at one of
 * two tables depending on entity_type, which is the price of the shared table
 * and the reason the shared table is worth it — one index, one lookup, one repo,
 * for both kinds of address.
 *
 * A foreign key's real job here is what happens on DELETE, and that part can be
 * kept. Without it, deleting a deck would leave its addresses behind to block
 * the next thing that wanted one — a bug that would surface months later as
 * "that slug is taken" pointing at nothing.
 */
CREATE FUNCTION ctr.forget_slugs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM ctr.slugs WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;
  RETURN OLD;
END $$;

CREATE TRIGGER decks_forget_slugs AFTER DELETE ON ctr.decks
  FOR EACH ROW EXECUTE FUNCTION ctr.forget_slugs('deck');

CREATE TRIGGER forms_forget_slugs AFTER DELETE ON ctr.forms
  FOR EACH ROW EXECUTE FUNCTION ctr.forget_slugs('form');

-- 1 · the live addresses.
INSERT INTO ctr.slugs (entity_type, slug, entity_id, is_current)
SELECT 'deck', slug, id, true FROM ctr.decks WHERE slug <> ''
UNION ALL
SELECT 'form', slug, id, true FROM ctr.forms WHERE slug <> '';

-- 2 · the redirects, minus anything already claimed, oldest claimant winning.
INSERT INTO ctr.slugs (entity_type, slug, entity_id, is_current)
SELECT DISTINCT ON (entity_type, slug) entity_type, slug, entity_id, false
  FROM (
    SELECT 'deck' AS entity_type, former.value #>> '{}' AS slug, d.id AS entity_id, d.created_at
      FROM ctr.decks d, jsonb_array_elements(d.former_slugs) AS former(value)
     WHERE jsonb_typeof(former.value) = 'string'
    UNION ALL
    SELECT 'form', former.value #>> '{}', f.id, f.created_at
      FROM ctr.forms f, jsonb_array_elements(f.former_slugs) AS former(value)
     WHERE jsonb_typeof(former.value) = 'string'
  ) AS claim
 WHERE slug <> ''
   AND NOT EXISTS (
     SELECT 1 FROM ctr.slugs held
      WHERE held.entity_type = claim.entity_type AND held.slug = claim.slug
   )
 ORDER BY entity_type, slug, created_at;

/*
 * Say out loud what was thrown away. A redirect that could not be honoured is
 * exactly the thing somebody will look for later, and a migration that resolves
 * a four-way collision in silence is one nobody can audit afterwards.
 */
DO $$
DECLARE
  dropped int;
BEGIN
  SELECT count(*) INTO dropped
    FROM (
      SELECT 'deck' AS entity_type, former.value #>> '{}' AS slug
        FROM ctr.decks d, jsonb_array_elements(d.former_slugs) AS former(value)
       WHERE jsonb_typeof(former.value) = 'string'
      UNION ALL
      SELECT 'form', former.value #>> '{}'
        FROM ctr.forms f, jsonb_array_elements(f.former_slugs) AS former(value)
       WHERE jsonb_typeof(former.value) = 'string'
    ) AS claim
   WHERE slug <> ''
     AND NOT EXISTS (
       SELECT 1 FROM ctr.slugs s
        WHERE s.entity_type = claim.entity_type AND s.slug = claim.slug AND NOT s.is_current
     );

  IF dropped > 0 THEN
    RAISE NOTICE
      '% former address(es) were already claimed by a live one and were not carried over.',
      dropped;
  END IF;
END $$;
