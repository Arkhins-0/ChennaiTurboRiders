import "server-only";

import { type SlugHolder } from "@/lib/slug";
import { findSlugOwner } from "@/lib/server/slugsRepo";

/**
 * One address space for `/<sport>/calendar/<slug>`.
 *
 * `ctr.slugs` keeps a namespace per `entity_type`, which is right for `/deck/x`
 * and `/register/x` because those are different routes reading different tables.
 * A season and a round are the SAME route reading two tables — `/incrc/calendar/2026`
 * and `/incrc/calendar/round-01` — so the database would happily let both be
 * called `2026` and the route would then have to pick one. 0021's reconcile
 * refuses that state; this is what stops it being reached in the first place.
 *
 * Its own file rather than a function on either repo: seasonsRepo reads events
 * to work out which season is running, and eventsRepo needs this on every write,
 * so putting it on either one makes the two import each other in a cycle.
 */

/** A holder, and which of the two kinds it is — the refusal has to say. */
export type CalendarHolder = SlugHolder & { kind: "season" | "event" };

/**
 * Who answers to this calendar address — a season, a round, or nothing.
 *
 * `exceptId` skips the record being saved, whichever kind it is: an id is a uuid
 * and already says which table it is in, so one parameter covers both.
 */
export async function findCalendarSlugOwner(
  siteId: string,
  slug: string,
  exceptId = ""
): Promise<CalendarHolder | null> {
  const [season, event] = await Promise.all([
    findSlugOwner("season", siteId, slug, exceptId),
    findSlugOwner("event", siteId, slug, exceptId),
  ]);

  /*
   * The live holder wins the tie, because that is the answer that decides
   * whether the address can be handed over at all: a live address cannot be
   * taken, a redirect can be released. `slugsRepo.findSlugOwner` makes the same
   * call within one kind, for the same reason.
   */
  const found =
    (season?.held === "current" && season) ||
    (event?.held === "current" && event) ||
    season ||
    event;

  if (!found) return null;
  return { ...found, kind: found === season ? "season" : "event" };
}

/** The refusal, as a sentence rather than a constraint name. */
export function calendarSlugTaken(slug: string, holder: CalendarHolder): string {
  const thing = holder.kind === "season" ? "season" : "round";
  const name = holder.name || `another ${thing}`;

  return holder.held === "current"
    ? `/calendar/${slug} is where the ${thing} “${name}” lives. Give that a different address first.`
    : `/calendar/${slug} is an old address of the ${thing} “${name}” and still redirects there.`;
}
