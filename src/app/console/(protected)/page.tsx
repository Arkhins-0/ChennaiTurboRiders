import { redirect } from "next/navigation";
import { canManageAdmins, canSeeAnySite, canSeeSite } from "@/lib/roles";
import { getSession } from "@/lib/server/auth";
import { listSites } from "@/lib/server/sitesRepo";

export const dynamic = "force-dynamic";

/**
 * The admin host's root has no screen of its own — it sends you to your first.
 *
 * "The first entry in the navigation" is not good enough now that accounts are
 * scoped: sending a co-admin to the landing editor would land them on a screen
 * that answers `notFound()`, so the root has to ask the same question the
 * navigation asks and pick the first sport this account actually holds.
 *
 * An account with nothing is a real state — an owner has made an account and
 * not yet ticked anything on it — and it gets a plain card saying so rather
 * than a redirect loop or a 404 that reads as "the admin is broken".
 */
export default async function AdminIndexPage() {
  const session = await getSession();
  const sites = await listSites();

  /*
   * The first screen of the first sport this account can open. The site's own
   * address used to be the section-built landing page; there is no such page
   * now, so the door is the identity screen.
   */
  const mine = sites.find((site) => canSeeSite(session, site.id));
  if (mine) redirect(`/site/${mine.slug}/identity`);

  if (canManageAdmins(session)) redirect("/admins");
  if (canSeeAnySite(session)) redirect("/media");

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-sm font-semibold text-foreground">Nothing assigned yet</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-fg">
          This account has no sports on it. An owner can give it one, or a part of one, from
          Accounts.
        </p>
      </div>
    </div>
  );
}
