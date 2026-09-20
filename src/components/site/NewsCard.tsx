import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TiltCard } from "@/components/site/TiltCard";
import type { ArticleSummary } from "@/lib/articles";
import { formatDate } from "@/lib/format";

/**
 * What a card needs, and nothing else.
 *
 * Narrower than `NewsArticle` on purpose: the same card is drawn from the static
 * JSON and from an `ArticleSummary` off the database, and neither should have to
 * grow the other's fields to be drawn.
 */
export type NewsCardArticle = {
  slug: string;
  title: string;
  image: string;
  /** "" draws no chip — an empty pill is worse than no pill. */
  category: string;
  publishDate: string;
  excerpt: string;
};

/** A summary off the database, in the shape the card draws. */
export function newsCardFrom(article: ArticleSummary): NewsCardArticle {
  return {
    slug: article.slug,
    title: article.title,
    image: article.cover_image,
    category: article.category,
    publishDate: article.published_at,
    excerpt: article.subtext,
  };
}

function Meta({ article }: { article: NewsCardArticle }) {
  return (
    <p className="readout flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
      {article.category ? <span className="text-racing-yellow">{article.category}</span> : null}
      {article.category && article.publishDate ? <span className="size-1 rotate-45 bg-carbon-400" /> : null}
      {article.publishDate ? <span>{formatDate(article.publishDate)}</span> : null}
    </p>
  );
}

/**
 * A story in a list: a tilting card, the cover under a dark wash, the words
 * laid over its lower half. Hover lifts the wash and the tilt follows the
 * pointer.
 */
export function NewsCard({ article }: { article: NewsCardArticle }) {
  return (
    <TiltCard className="flex w-full">
      <Link
        href={`/news/${article.slug}`}
        className="group relative flex w-full flex-col justify-end overflow-hidden bg-carbon-900"
      >
        <div className="relative aspect-[4/5] sm:aspect-[3/4]">
          {article.image ? (
            <img
              src={article.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover grayscale-[0.5] transition-[transform,filter] duration-700 group-hover:scale-[1.04] group-hover:grayscale-0"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-carbon-950 via-carbon-950/60 to-carbon-950/10" />
          <div className="grain absolute inset-0 opacity-30" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <Meta article={article} />
          <h3 className="heading-font mt-3 line-clamp-3 text-2xl font-bold uppercase leading-[0.95] text-white transition-colors group-hover:text-racing-yellow md:text-3xl">
            {article.title}
          </h3>
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-carbon-300">{article.excerpt}</p>
          <span className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
            Read
            <ArrowUpRight className="size-3.5 text-racing-yellow transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </TiltCard>
  );
}

/**
 * The lead story: the cover across two columns' width, the words on the
 * right, the readout saying it is the latest.
 */
export function FeaturedNews({ article }: { article: NewsCardArticle }) {
  return (
    <Link
      href={`/news/${article.slug}`}
      className="group relative grid overflow-hidden bg-carbon-900 md:grid-cols-[1.4fr_1fr]"
    >
      <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[440px]">
        {article.image ? (
          <img
            src={article.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="grain absolute inset-0 opacity-30" />
        <span className="readout absolute left-4 top-4 flex items-center gap-2 bg-carbon-950/80 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-racing-yellow animate-blink" />
          Latest
        </span>
      </div>
      <div className="hud-corners flex flex-col justify-end p-6 md:p-8">
        <Meta article={article} />
        <h3 className="heading-font lean mt-4 text-3xl font-bold uppercase leading-[0.9] text-white transition-colors group-hover:text-racing-yellow md:text-5xl">
          {article.title}
        </h3>
        <p className="mt-4 line-clamp-3 text-base leading-relaxed text-carbon-300">{article.excerpt}</p>
        <span className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
          Read the story
          <ArrowUpRight className="size-4 text-racing-yellow transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
