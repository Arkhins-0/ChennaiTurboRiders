/**
 * An admin account, as everything except the password sees it.
 *
 * The password is deliberately not in this type and never leaves the server:
 * `adminsRepo` does not select the column, so there is no path by which a hash
 * reaches a browser even by accident. What comes back from a save is the
 * account WITHOUT it, which is also why creating one takes a different shape
 * from reading one.
 *
 * Accounts have no order. They are listed by name, and there is no `sort_order`
 * here or on the table — a list of five people is read by looking, not by being
 * arranged.
 *
 * Shared by the server and the browser, so nothing here may import
 * `server-only`.
 */

import { GRANT_LABELS, normaliseGrants, normaliseRole, type AdminRole, type Grant } from "@/lib/roles";
import { optionalText } from "@/lib/normalise";

export type AdminAccount = {
  id: string;
  username: string;
  role: AdminRole;
  /**
   * Every (site, module) pair the account holds.
   *
   * This was `pages: PageKey[]` — a list of screens, which was the whole scope
   * while there was one sport to own them. A grant names the sport as well, so
   * "may edit decks" cannot quietly mean everybody's decks.
   */
  grants: Grant[];
  created_at: string;
};

export const ADMIN_LIMITS = {
  username: 60,
  password: 200,
} as const;

/**
 * The same floor `scripts/create-admin.mjs` holds to.
 *
 * Ten characters and nothing else — no character-class rules. This admin has no
 * password reset by email and no lockout, so what protects it is length and the
 * fact that the host is not published; a rule demanding a symbol only makes the
 * password one somebody writes on a card.
 */
export const MIN_PASSWORD = 10;

/** What a new account starts from. */
export const BLANK_ADMIN: Omit<AdminAccount, "id" | "created_at"> = {
  username: "",
  role: "member",
  grants: [],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same reasoning as the circuits: a malformed id should 404, not blow up Postgres. */
export function isAdminId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * A username, cleaned.
 *
 * Lower-cased, because a person who signs in as "Ravi" and is stored as "ravi"
 * has a login that works on some days. Spaces are out for the same reason a
 * trailing one is: it cannot be seen in a text field.
 */
export function normaliseUsername(value: unknown): string {
  return optionalText(value, ADMIN_LIMITS.username).toLowerCase().replace(/\s+/g, "");
}

/**
 * Whatever came off the wire, as a storable account.
 *
 * The grants are kept whatever the role is, rather than emptied for an owner.
 * It costs nothing, and it means promoting an account to owner and back does
 * not lose what it was scoped to — the predicates in roles.ts short-circuit on
 * the role, so nothing reads the list wrongly in the meantime.
 */
export function normaliseAdminInput(input: unknown): Omit<AdminAccount, "id" | "created_at"> {
  const record = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;

  return {
    username: normaliseUsername(record.username),
    role: normaliseRole(record.role),
    grants: normaliseGrants(record.grants),
  };
}

/**
 * What the screen says an account can reach, in one line.
 *
 * Grouped by site rather than listed flat, because "INCRC: everything" and
 * "INCRC: articles, Pickle: articles" are the two shapes worth telling apart at
 * a glance, and a flat list of nine module names tells nobody which sport.
 */
export function describeAccess(
  account: Pick<AdminAccount, "role" | "grants">,
  siteNames: Record<string, string> = {}
): string {
  if (account.role === "owner") return "Every sport, and the accounts";

  const bySite = new Map<string, string[]>();
  for (const grant of account.grants) {
    const name = siteNames[grant.siteId] ?? grant.siteSlug;
    if (!bySite.has(name)) bySite.set(name, []);
    bySite.get(name)!.push(grant.module);
  }

  const parts = [...bySite].map(([name, modules]) =>
    modules.includes("*")
      ? `${name}: everything`
      : `${name}: ${modules.map((m) => GRANT_LABELS[m as keyof typeof GRANT_LABELS] ?? m).join(", ")}`
  );

  // Last, and with no sport in front of it — that absence is the whole point of
  // a capability, and a reader scanning the rail should be able to see that this
  // one is not somebody's sport.

  return parts.length === 0 ? "Nothing yet" : parts.join(" · ");
}
