import type { Metadata } from "next";
import { FeaturedNews, NewsCard, newsCardFrom } from "@/components/site/NewsCard";
import { PageHeader } from "@/components/site/PageHeader";
import { Reveal } from "@/components/site/Reveal";
import { listPublishedArticles } from "@/lib/server/articlesRepo";
import { getRootSite } from "@/lib/server/sitesRepo";

export const metadata: Metadata = {
  title: "News",
  description: "The latest news, race results and announcements from Chennai Turbo Riders.",
};

export default async function NewsPage() {
  const site = await getRootSite();
  const articles = await listPublishedArticles(site.id);
  const [lead, ...rest] = articles;

  return (
    <>
      <PageHeader
        crumb="News"
        title="Paddock Feed"
        description="Race results, team announcements and everything from the CTR garage."
        aside={articles.length > 0 ? `${articles.length} stories` : undefined}
      />

      <div className="section-container py-16 md:py-24">
        {articles.length === 0 ? (
          /* An empty index says so: on a fresh install, and any time every
             piece is a draft, this is a state the page can reach. */
          <p className="hud-corners p-16 text-center text-carbon-300">
            Nothing published yet — check back shortly.
          </p>
        ) : (
          <>
            <Reveal>
              <FeaturedNews article={newsCardFrom(lead)} />
            </Reveal>
            {rest.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {rest.map((article, i) => (
                  <Reveal key={article.id} delay={(i % 3) * 0.08} className="flex">
                    <NewsCard article={newsCardFrom(article)} />
                  </Reveal>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
