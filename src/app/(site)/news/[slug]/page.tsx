import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ArticleBody } from "@/components/site/articles/ArticleBody";
import { NewsCard, newsCardFrom } from "@/components/site/NewsCard";
import { formatDate } from "@/lib/format";
import { getArticleBySlug, listPublishedArticles } from "@/lib/server/articlesRepo";
import { siteTeam } from "@/lib/server/siteContent";
import { getRootSite } from "@/lib/server/sitesRepo";

export async function generateStaticParams() {
  const site = await getRootSite();
  const articles = await listPublishedArticles(site.id);
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getRootSite();
  const article = await getArticleBySlug(site.id, slug);

  if (!article) return { title: "News" };
  return { title: article.title, description: article.subtext };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getRootSite();
  const article = await getArticleBySlug(site.id, slug);

  // A draft is not on the internet, and neither is an address nobody holds.
  if (!article || article.status !== "published") notFound();

  // A former address still finds the piece; correct the address bar rather
  // than serving the article at two URLs.
  if (article.slug !== slug) permanentRedirect(`/news/${article.slug}`);

  // The team's initials, for the breadcrumb over the headline. Named `team`
  // because `site` above is the routing row, and the two are different things.
  const { site: team } = await siteTeam();

  const related = (await listPublishedArticles(site.id))
    .filter((entry) => entry.slug !== article.slug)
    .slice(0, 3);

  return (
    <article className="pb-20">
      {/* Title card */}
      <header className="relative overflow-hidden bg-carbon-950 pt-32 md:pt-44">
        <div className="hud-grid pointer-events-none absolute inset-0" />
        <div className="section-container relative">
          <div className="hud-corners px-5 py-6 md:px-8 md:py-8">
            <div className="readout flex flex-wrap items-center justify-between gap-3">
              <Link href="/news" className="inline-flex items-center gap-2 hover:text-racing-yellow">
                <ArrowLeft className="size-4" /> All stories
              </Link>
              <span>
                <span className="text-racing-yellow">{team.abbreviation}</span>
                <span className="mx-2 text-carbon-400">/</span>
                News
                {article.category ? (
                  <>
                    <span className="mx-2 text-carbon-400">/</span>
                    {article.category}
                  </>
                ) : null}
              </span>
            </div>

            <h1 className="heading-font lean mt-8 max-w-5xl text-[clamp(2.5rem,7.5vw,6rem)] font-bold uppercase leading-[0.88] tracking-tight text-white">
              {article.title}
            </h1>

            {article.subtext ? (
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-carbon-300">{article.subtext}</p>
            ) : null}

            <p className="readout mt-8 flex flex-wrap gap-x-5 gap-y-1 text-[10px]">
              {article.published_at ? <span>{formatDate(article.published_at)}</span> : null}
              {article.author ? <span>Words · {article.author}</span> : null}
            </p>
          </div>
        </div>
      </header>

      {article.cover_image ? (
        <div className="section-container mt-8">
          <div className="relative aspect-[21/9] overflow-hidden bg-carbon-900">
            <img
              src={article.cover_image}
              alt={article.title}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="h-full w-full object-cover"
            />
            <div className="grain absolute inset-0 opacity-30" />
          </div>
        </div>
      ) : null}

      <div className="section-container mt-12 grid gap-12 md:grid-cols-[1fr_3fr]">
        <aside className="hidden md:block">
          <div className="sticky top-28 space-y-6">
            {article.published_at ? (
              <div>
                <p className="readout text-[10px]">Published</p>
                <p className="mt-1 font-mono text-xs text-white">{formatDate(article.published_at)}</p>
              </div>
            ) : null}
            {article.author ? (
              <div>
                <p className="readout text-[10px]">Words</p>
                <p className="mt-1 font-mono text-xs text-white">{article.author}</p>
              </div>
            ) : null}
            {article.tags.length > 0 ? (
              <div>
                <p className="readout text-[10px]">Tags</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {article.tags.map((tag) => (
                    <li key={tag} className="border border-white/15 px-2 py-1 font-mono text-[10px] text-carbon-200">
                      #{tag}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="max-w-3xl">
          {/* The body is a tree of typed nodes rendered by the same component
              the console previews with, so what a writer sees is this page. */}
          <ArticleBody doc={article.body} className="space-y-6 text-lg leading-relaxed text-carbon-100" />

          {article.tags.length > 0 ? (
            <ul className="mt-10 flex flex-wrap gap-2 md:hidden">
              {article.tags.map((tag) => (
                <li key={tag} className="border border-white/15 px-2 py-1 font-mono text-[10px] uppercase text-carbon-200">
                  #{tag}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {related.length > 0 ? (
        <section className="section-container mt-24 border-t border-white/10 pt-12">
          <p className="readout mb-8 text-racing-yellow">More stories</p>
          <div className="grid gap-4 md:grid-cols-3">
            {related.map((entry) => (
              <NewsCard key={entry.id} article={newsCardFrom(entry)} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
