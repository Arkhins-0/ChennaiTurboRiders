import { requireSiteAccess } from "@/lib/server/access";
import { SiteScope } from "@/admin/components/SiteScope";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
  params: Promise<{ sport: string }>;
};

/**
 * Everything under one sport.
 *
 * Two jobs, and they are the same job twice — once for the server and once for
 * the browser:
 *
 *   `requireSiteAccess` refuses a sport this account cannot reach AT ALL. It is
 *   deliberately the WIDEST check: a co-admin granted only `articles` must get
 *   past it, because /site/incrc/articles is theirs. Each screen below then asks
 *   the narrow question for itself with `requireSite(slug, module)`, and every
 *   API route asks it a third time. This is the outer door, not the only one.
 *
 *   `SiteScope` puts the sport where the client components can read it, so a
 *   `SlugField` four levels down can ask whether an address is free without the
 *   slug being threaded through every component in between.
 *
 * A sport that does not exist and a sport that is not yours both `notFound()`,
 * which is what stops the console being a way to enumerate the sports somebody
 * else runs.
 */
export default async function SiteLayout({ children, params }: Props) {
  const { sport } = await params;
  const { site } = await requireSiteAccess(sport);

  return <SiteScope site={site}>{children}</SiteScope>;
}
