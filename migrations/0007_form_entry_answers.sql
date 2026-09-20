-- 0007 · a submission's answers become rows
--
-- This is the cheapest moment this work will ever have: `form_entries` holds
-- **zero rows**, and so does `enquiries`. There is no backfill in this file, no
-- data to reconcile and nothing to get wrong. The same migration written after
-- the first race weekend would be a different job.
--
-- ── What it replaces ──────────────────────────────────────────────────────
--
-- `form_entries.answers` is a flat JSONB map keyed by field id. Sorting the
-- entries table by an answer therefore costs an unindexable expression over
-- `answers->>key` with a regex test and a `::numeric` cast to decide whether the
-- column is a number (entriesRepo.ts). It becomes `ORDER BY value_num NULLS
-- LAST, lower(value_text)` on an indexed join.
--
-- `value_num` and `value_date` are populated ON WRITE when the answer parses as
-- one, and left NULL when it does not, which is what makes the sort indexable:
-- the decision happens once, when the entry is stored, rather than on every
-- read of every row.
--
-- ── `idx` ─────────────────────────────────────────────────────────────────
--
-- A checkbox group or a multiselect is several answers to one question. `idx` is
-- which one, so the primary key can stay (entry, field, answer) and a
-- multiselect does not need a second table or a delimiter nobody can type.
-- Single-value answers are always idx 0.
--
-- ── The files ─────────────────────────────────────────────────────────────
--
-- A file answer is currently a STRING with JSON inside it —
-- `file::{"key":…,"name":…,"size":…}` (FILE_PREFIX, src/lib/forms.ts) — encoded
-- that way so `answers` could stay a flat map of strings and every existing
-- reader kept working. It is a sound trick and it has one real cost:
-- `deleteForm` loads every entry's whole answers blob and runs a `JSON.parse`
-- per value purely to harvest the S3 keys it has to delete. With a table it is
-- one indexed select, and the keys cannot be missed because a file is no longer
-- disguised as text.
--
-- The attachment itself stays where it is — under ENTRY_PREFIX in the bucket,
-- private, reachable only through the authenticated route that streams it. This
-- table holds the key, never the bytes.
--
-- Expand only: `form_entries.answers` stays until phase 4 stops reading it.
-- With no rows in either table that is a formality here, but the discipline is
-- the same one every migration in this phase follows.

CREATE TABLE ctr.form_entry_answers (
  entry_id   uuid NOT NULL REFERENCES ctr.form_entries(id) ON DELETE CASCADE,
  /* The FIELD ID, never the label: a label is edited freely and an answer has
     to keep meaning what it meant when it was sent. */
  field_id   text NOT NULL,
  /* Which of several answers to one question. 0 unless it is a multiselect. */
  idx        smallint NOT NULL DEFAULT 0,
  /*
   * Whether the answer was a LIST, as opposed to one value that happens to be
   * alone. `Submission` is `Record<string, string | string[]>` and the two are
   * different things to everything that reads one: a checkbox group with a
   * single box ticked is `["yes"]`, not `"yes"`. Without this, row count would
   * be the only evidence and a one-element list would come back as a scalar.
   */
  is_list    boolean NOT NULL DEFAULT false,
  value_text text NOT NULL DEFAULT '',
  /* Set only when the answer parses as one. NULL is "not a number", which is
     what makes the sort below an index scan rather than a cast per row. */
  value_num  numeric,
  value_date date,

  PRIMARY KEY (entry_id, field_id, idx),
  CONSTRAINT form_entry_answers_idx_check CHECK (idx >= 0)
);

CREATE INDEX form_entry_answers_num_idx  ON ctr.form_entry_answers (field_id, value_num);
CREATE INDEX form_entry_answers_text_idx ON ctr.form_entry_answers (field_id, lower(value_text));

CREATE TABLE ctr.form_entry_files (
  entry_id   uuid NOT NULL REFERENCES ctr.form_entries(id) ON DELETE CASCADE,
  field_id   text NOT NULL,
  idx        smallint NOT NULL DEFAULT 0,
  /* The object key under ENTRY_PREFIX. Never a URL: these are licence scans and
     passport photographs, and nothing ever hands out an address for one. */
  s3_key     text NOT NULL,
  file_name  text NOT NULL DEFAULT '',
  size_bytes bigint NOT NULL DEFAULT 0,

  PRIMARY KEY (entry_id, field_id, idx),
  CONSTRAINT form_entry_files_key_not_blank CHECK (s3_key <> '')
);

/* Deleting a form cascades to its entries; this is how their files are found. */
CREATE INDEX form_entry_files_key_idx ON ctr.form_entry_files (s3_key);

DO $$
DECLARE
  entries int;
BEGIN
  SELECT count(*) INTO entries FROM ctr.form_entries;

  IF entries > 0 THEN
    RAISE EXCEPTION
      'This migration assumes no submissions exist, and there are %. It needs a backfill out of answers before it can run.',
      entries;
  END IF;

  RAISE NOTICE 'answers and files are tables; % submission(s) to carry over.', entries;
END $$;
