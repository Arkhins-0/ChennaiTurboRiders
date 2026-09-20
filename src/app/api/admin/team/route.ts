import { NextResponse } from "next/server";
import { isAdminId } from "@/lib/admins";
import { grantableModules, normaliseGrantModules, type Grant } from "@/lib/roles";
import { guardRequestSite } from "@/lib/server/access";
import { getAdmin, setSiteGrants } from "@/lib/server/adminsRepo";
import { getSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The co-admins of one sport.
 *
 * `PUT ?site=<slug>` with `{ adminId, modules }` — the account's grants ON THIS
 * SITE, replaced wholesale. Its grants on every other site are not sent, not
 * read and not touched: a sport admin has no business changing who runs
 * pickleball, and the safest way to guarantee that is for the write to be
 * incapable of naming another site.
 *
 * ── The three refusals ────────────────────────────────────────────────────
 *
 * `guardRequestSite(request, "team")` is the first: only a `*` holder on this
 * sport, or an owner, gets past it.
 *
 * `grantableModules` is the second, and it is the one that matters. It leaves
 * `*` out, so this route cannot create another sport admin however the body is
 * shaped. A sport admin can hand out every piece of their own sport and cannot
 * clone themselves — the only account that can make one is the owner, which is
 * what keeps "who owns this sport" answerable.
 *
 * An OWNER's grants are the third. They already reach everything, so writing a
 * grant on one would be storing something no predicate reads, and removing one
 * would look like it had done something. Refused outright.
 */
export async function PUT(request: Request) {
  const guard = await guardRequestSite(request, "team");
  if (guard.denied) return guard.denied;

  const session = (await getSession())!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { adminId, modules } = (body ?? {}) as { adminId?: unknown; modules?: unknown };

  if (!isAdminId(adminId)) {
    return NextResponse.json({ error: "Expected an account." }, { status: 400 });
  }

  const target = await getAdmin(adminId);
  if (!target) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  if (target.role === "owner") {
    return NextResponse.json(
      { error: "An owner already reaches every sport. There is nothing to grant." },
      { status: 400 }
    );
  }

  /*
   * Whatever was asked for, narrowed to what this account may actually hand
   * out. Silently dropping the rest rather than refusing the request: the UI
   * only offers grantable modules, so anything else in the body did not come
   * from the screen, and the useful answer to that is the grant that was
   * legitimate rather than an error about the part that was not.
   */
  const allowed = new Set(grantableModules(session, guard.site.id));
  const wanted = normaliseGrantModules(modules).filter((module) => allowed.has(module));

  const grants: Grant[] = wanted.map((module) => ({
    siteId: guard.site.id,
    siteSlug: guard.site.slug,
    module,
  }));

  try {
    await setSiteGrants(adminId, guard.site.id, grants);
    return NextResponse.json({ grants });
  } catch (error) {
    console.error("[admin/team] PUT", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
