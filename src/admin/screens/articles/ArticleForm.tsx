"use client";

import {
  ARTICLE_LIMITS,
  ARTICLE_MAX_TAGS,
  ARTICLE_STATUSES,
  ARTICLE_STATUS_LABELS,
  type Article,
  type ArticleStatus,
} from "@/lib/articles";
import type { RichDoc } from "@/lib/richtext";
import type { SlugHolder } from "@/lib/slug";
import { Button } from "@/admin/ui/Button";
import { Label, Select } from "@/admin/ui/Input";
import { ExternalIcon, TrashIcon } from "@/admin/ui/icons";
import { Field, Hint, Note, Panel, Row, TextArea } from "@/admin/components/Fields";
import { FormerSlugs } from "@/admin/components/FormerSlugs";
import { ImageField } from "@/admin/components/ImageField";
import { SlugField } from "@/admin/components/SlugField";
import { RichText } from "@/admin/components/richtext/RichText";

/**
 * One article's fields.
 *
 * A pure controlled component, like `DeckForm`: no fetching, no state of its own,
 * everything through one `set`. What it holds that no other form in this admin
 * does is the body, and that is deliberately the LAST thing on the panel — the
 * four fields above it are the ones that decide where the article lives and who
 * can see it, and they are quick. Writing is the long job and it belongs at the
 * bottom where the column can scroll.
 */
export function ArticleForm({
  article,
  siteUrl,
  onChange,
  onDelete,
  onReleasedSlug,
  busy,
}: {
  article: Article;
  siteUrl: string;
  onChange: (next: Article) => void;
  onDelete: () => void;
  onReleasedSlug?: (holder: SlugHolder, slug: string) => void;
  busy?: boolean;
}) {
  const set = (patch: Partial<Article>) => onChange({ ...article, ...patch });

  return (
    <div className="space-y-2.5">
      <Panel title="Article">
        <div className="space-y-3">
          <Field
            label="Title"
            value={article.title}
            onChange={(title) => set({ title })}
            placeholder="Season opener at Kari"
            maxLength={ARTICLE_LIMITS.title}
          />

          <SlugField
            kind="article"
            value={article.slug}
            onChange={(slug) => set({ slug })}
            exceptId={article.id}
            suggestion={article.title}
            onReleased={onReleasedSlug}
            disabled={busy}
          />

          <FormerSlugs
            kind="article"
            slugs={article.former_slugs}
            onChange={(former_slugs) => set({ former_slugs })}
            disabled={busy}
          />

          <TextArea
            label="Subtext"
            value={article.subtext}
            onChange={(subtext) => set({ subtext })}
            rows={3}
            maxLength={ARTICLE_LIMITS.subtext}
            hint="The line under the title. It is also what a card linking here says, and what a search engine prints."
          />

          <Row>
            <Field
              label="Category"
              value={article.category}
              onChange={(category) => set({ category })}
              placeholder="Race Report"
              maxLength={ARTICLE_LIMITS.category}
              hint="The chip over the cover. Leave blank for no chip."
            />

            <Field
              label="Author"
              value={article.author}
              onChange={(author) => set({ author })}
              placeholder="CTR Media"
              maxLength={ARTICLE_LIMITS.author}
              hint="Printed beside the date. Blank runs it unsigned."
            />
          </Row>

          {/*
            Tags, as one comma-separated line.

            Stored as an array — `lines()` takes nothing else — so the split
            happens here rather than in the normaliser, which would then have to
            guess whether a string meant one tag or several. Trimming and the
            duplicate check are the normaliser's, so pasting "a, a , A" is
            allowed to arrive and is cleaned once, on the way in.
          */}
          <Field
            label="Tags"
            value={article.tags.join(", ")}
            onChange={(value) => set({ tags: value.split(",").map((tag) => tag.trim()) })}
            placeholder="podium, rookie, Kari Motor Speedway"
            hint={`Separated by commas. Up to ${ARTICLE_MAX_TAGS}; printed under the piece.`}
          />

          <Row>
            {/*
              "Appears on" is gone.

              It chose between the pages this account could reach, plus an
              owner-only "All pages" that meant the article belonged to none of
              them. An article belongs to a SPORT now, set from the screen it
              was created on, so there is nothing to pick — and the option that
              would have been interesting, moving one between sports, is the one
              thing the addresses and the media folders could not follow.
            */}
            <label className="block">
              <Label>Status</Label>
              <Select
                value={article.status}
                onChange={(event) => set({ status: event.target.value as ArticleStatus })}
                disabled={busy}
                className="mt-1.5"
              >
                {ARTICLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ARTICLE_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
              <Hint className="mt-1">A draft is not published and its address 404s.</Hint>
            </label>
          </Row>

          <label className="block">
            <Label>Date</Label>
            {/* A plain date input. Printed under the title exactly as stored, and
                never used for ordering — that is the sidebar's job. */}
            <input
              type="date"
              value={article.published_at}
              onChange={(event) => set({ published_at: event.target.value })}
              disabled={busy}
              className="mt-1.5 h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50"
            />
            <Hint className="mt-1">Optional. Printed above the title.</Hint>
          </label>

          {article.status === "published" && article.slug ? (
            <a
              href={`${siteUrl}/news/${article.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-fg underline underline-offset-2 transition-colors hover:text-foreground"
            >
              <ExternalIcon className="size-3.5" />
              Open /news/{article.slug}
            </a>
          ) : null}
        </div>
      </Panel>

      <Panel title="Cover">
        <ImageField
          label="Cover image"
          value={article.cover_image}
          onChange={(cover_image) => set({ cover_image })}
          disabled={busy}
          variant="photo"
          hint="Shown above the title and on any card linking here. Drop one in, pick one from the library, or paste an address."
        />
      </Panel>

      <Panel title="Words">
        <RichText
          // Keyed so switching article REBUILDS the editor rather than pushing a
          // whole new document through the running one. ProseMirror keeps undo
          // history per instance, and history that spans two articles would let
          // Ctrl-Z paste one into the other.
          key={article.id}
          value={article.body as RichDoc}
          onChange={(body) => set({ body })}
          disabled={busy}
        />
      </Panel>

      <Panel title="Danger">
        <Note className="mb-2">
          Deleting an article stops its address working. Any picture used only by this article is
          removed with it; anything shared is moved to the shared uploads folder.
        </Note>
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={busy}>
          <TrashIcon />
          Delete this article
        </Button>
      </Panel>
    </div>
  );
}
