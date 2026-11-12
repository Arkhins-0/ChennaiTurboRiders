-- 0027 · drop ctr.events.badge
--
-- The site does not take entries; it shows the team's calendar. The free-text
-- chip ("Entries open", "Season finale") was typed once and went stale the
-- moment a weekend was run. The chip is now worked out from the dates
-- (roundStatus in src/lib/raceDates.ts): Complete, Next, Season finale or
-- Upcoming. Nothing reads the column any more, so it goes.
--
-- Nothing depends on it — no view, function or index names it.

ALTER TABLE ctr.events DROP COLUMN IF EXISTS badge;
