/**
 * Turning an event's two dates into the things the calendar needs: a line to
 * print, a moment to count down to, and whether the weekend has been and gone.
 *
 * Everything here works in UTC on purpose. An event is a day, not an instant —
 * "11 September" is the same weekend whether you read the page from Chennai or
 * from Berlin — and building dates in local time would make the countdown and
 * the "done" flag flip at different moments for different readers.
 *
 * ── Why the parameter is a shape and not a type ───────────────────────────
 *
 * These took a `Round` — a value inside the calendar section's stored document —
 * until 0018 made an event a row of its own. What they actually need is three
 * strings, so that is what they ask for: `CtrEvent` and `EventSummary` both
 * satisfy `Dated`, and so would anything else with dates on it.
 *
 * Shared by the page and the admin's preview, so nothing here may import
 * `server-only` and nothing may read the clock at module scope.
 */

/** Enough of an event to say when it is. ISO `YYYY-MM-DD`, or "". */
export type Dated = {
  date_from: string;
  date_to: string;
  /** Overrides the printed line. Nothing else here reads it. */
  dates: string;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Midnight UTC on an ISO date, or null when there is no usable date. */
function parse(iso: string): Date | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** When the weekend opens. Null for an event whose date is not fixed. */
export function eventStart(event: Dated): Date | null {
  return parse(event.date_from);
}

/**
 * When the weekend is over: the end of the last day, so an event stops being
 * "upcoming" only once its final day has passed rather than at midnight on the
 * morning of it.
 */
export function eventEnd(event: Dated): Date | null {
  const last = parse(event.date_to) ?? parse(event.date_from);
  if (!last) return null;
  return new Date(last.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** A weekend already run. False for an event with no date, and before the clock is read. */
export function eventIsPast(event: Dated, now: Date | null): boolean {
  if (!now) return false;
  const end = eventEnd(event);
  return end ? end.getTime() < now.getTime() : false;
}

/**
 * The line the card prints.
 *
 * `dates` wins when it is filled in, because it is the override. Otherwise the
 * range is written out — collapsing the parts the two ends share, so a weekend
 * inside one month reads "11–13 September 2026" rather than repeating itself.
 */
export function eventDateLabel(event: Dated): string {
  if (event.dates) return event.dates;

  const start = parse(event.date_from);
  if (!start) return "";

  const end = parse(event.date_to);
  const [d1, m1, y1] = [start.getUTCDate(), start.getUTCMonth(), start.getUTCFullYear()];

  if (!end || end.getTime() === start.getTime()) {
    return `${d1} ${MONTHS[m1]} ${y1}`;
  }

  const [d2, m2, y2] = [end.getUTCDate(), end.getUTCMonth(), end.getUTCFullYear()];

  if (y1 !== y2) return `${d1} ${MONTHS[m1]} ${y1} – ${d2} ${MONTHS[m2]} ${y2}`;
  if (m1 !== m2) return `${d1} ${MONTHS[m1]} – ${d2} ${MONTHS[m2]} ${y1}`;
  return `${d1}–${d2} ${MONTHS[m1]} ${y1}`;
}

/**
 * The date as three pieces, for setting as a block rather than a sentence.
 *
 * `{ days: "11–13", month: "SEP", year: "2026" }` — the shape every motorsport
 * calendar prints, because a season is read by scanning down the days and the
 * month does not need repeating at the same size. Null when the event has no
 * date, which the caller shows as "TBC".
 */
export function eventDateParts(
  event: Dated
): { days: string; month: string; year: string } | null {
  const start = parse(event.date_from);
  if (!start) return null;

  const end = parse(event.date_to);
  const short = (date: Date) => MONTHS[date.getUTCMonth()].slice(0, 3).toUpperCase();

  if (!end || end.getTime() === start.getTime()) {
    return {
      days: String(start.getUTCDate()),
      month: short(start),
      year: String(start.getUTCFullYear()),
    };
  }

  // A weekend that crosses a month says both: "30 JAN – 01 FEB" is the only
  // honest way to write it, and it is rare enough not to disturb the rhythm.
  const month =
    start.getUTCMonth() === end.getUTCMonth() ? short(start) : `${short(start)} – ${short(end)}`;

  return {
    days: `${start.getUTCDate()}–${end.getUTCDate()}`,
    month,
    year: String(end.getUTCFullYear()),
  };
}

/**
 * The first event that has not finished, by date.
 *
 * Not simply the first in the list: the running order is the season's order, but
 * the season moves through it, and the card that should be big is the one that
 * has not happened yet. Events with no date are never "next" — nothing can be
 * counted down to.
 *
 * Returns an index into the list, or -1 when the season is over.
 */
export function nextEventIndex(events: readonly Dated[], now: Date): number {
  let best = -1;
  let bestTime = Infinity;

  events.forEach((event, index) => {
    const end = eventEnd(event);
    const start = eventStart(event);
    if (!end || !start || end.getTime() < now.getTime()) return;

    if (start.getTime() < bestTime) {
      bestTime = start.getTime();
      best = index;
    }
  });

  return best;
}
