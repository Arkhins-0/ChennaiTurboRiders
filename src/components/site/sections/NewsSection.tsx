import { FeaturedNews, NewsCard, newsCardFrom } from "@/components/site/NewsCard";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { listPublishedArticles } from "@/lib/server/articlesRepo";
import { getRootSite } from "@/lib/server/sitesRepo";

export async function NewsSection() {
  const site = await getRootSite();
  const latest = (await listPublishedArticles(site.id)).slice(0, 4);

  // Nothing published yet: the band goes entirely rather than leaving a
  // heading over an empty grid.
  if (latest.length === 0) return null;

  const [lead, ...rest] = latest;

  return (
    <section id="news" className="relative py-24 md:py-32">
      <div className="section-container">
        <SectionHeading
          index="05"
          label="Paddock"
          title="Latest News"
          action={{ href: "/news", label: "All stories" }}
        />

        <Reveal className="mt-14">
          <FeaturedNews article={newsCardFrom(lead)} />
        </Reveal>

        {rest.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {rest.map((article, i) => (
              <Reveal key={article.id} delay={i * 0.08} className="flex">
                <NewsCard article={newsCardFrom(article)} />
              </Reveal>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
