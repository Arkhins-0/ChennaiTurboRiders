import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { listSites } from "@/lib/server/sitesRepo";
import { AdminShell } from "@/admin/components/AdminShell";

export const metadata: Metadata = {
  title: "CTR Admin",
  robots: { index: false, follow: false },
};

/**
 * Signed in, and nothing more.
 *
 * Which SCREEN is each screen's own problem — see the note on `requireSite` in
 * src/lib/server/access.ts. What this adds is the two things the navigation
 * cannot be drawn without: the account's grants, and the sports that exist.
 *
 * The sites are read here rather than in every screen because `listSites` is
 * wrapped in React `cache()`, so the layout and the page below it share one
 * query — and the navigation needs all of them regardless of which one is open.
 */
export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    // A public path, not the mount point: the browser only ever sees the admin
    // host's own root, and the middleware maps that back to this tree.
    redirect("/login");
  }

  const sites = await listSites();

  return (
    <AdminShell
      username={session.username}
      role={session.role}
      grants={session.grants}
      sites={sites}
    >
      {children}
    </AdminShell>
  );
}
