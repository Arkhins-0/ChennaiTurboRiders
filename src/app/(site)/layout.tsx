import { Footer } from "@/components/site/Footer";
import { Navbar } from "@/components/site/Navbar";
import { Spotlight } from "@/components/site/Spotlight";
import { siteTeam } from "@/lib/server/siteContent";

/*
 * The frame around every page of the public site.
 *
 * `siteTeam()` is read here and the navigation is handed what it needs, because
 * the navigation is a client component. The footer is not, so it reads for
 * itself — and gets the same memoised result, not a second query.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { site, socialMedia } = await siteTeam();

  return (
    <div className="relative flex min-h-screen flex-col bg-carbon-950 text-white">
      <Spotlight />
      <Navbar site={site} socialMedia={socialMedia} />
      <main className="relative flex-1">{children}</main>
      <Footer />
    </div>
  );
}
