"use client";

import { useEffect, useRef, useState } from "react";
import { ARTICLE_STATUS_LABELS, BLANK_ARTICLE, type Article } from "@/lib/articles";
import { folderForEntity, folderForModule } from "@/lib/mediaPaths";
import type { SlugHolder } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { NewsIcon, PlusIcon } from "@/admin/ui/icons";
import { useSite, withSite } from "@/admin/components/SiteScope";
import { AdminRailSlot } from "@/admin/components/AdminShell";
import { EditorToolbar } from "@/admin/components/EditorToolbar";
import { Note, Panel } from "@/admin/components/Fields";
import { NewRecord } from "@/admin/components/NewRecord";
import { SectionRail, type RailItem } from "@/admin/components/SectionRail";
import { UploadFolder } from "@/admin/components/UploadFolder";
import { ArticlePreview } from "@/admin/components/previews/ArticlePreview";
import { ArticleForm } from "./ArticleForm";

/**
 * The articles, on the same three-column screen as every other editor.
 *
 * Sidebar, preview, fields — and the rail lists the articles themselves, because
 * an article IS the unit of work here in the way a deck is and a section of the
 * landing page is not.
 *
 * ── What is different from the decks screen ───────────────────────────────
 *
 * The list is not one page's worth of rows. It is whatever this account may edit,
 * which for an owner is everything and for a page editor is their pages —
 * narrowed by the server, in SQL, so an article they cannot open never reaches
 * the browser. That is why the rail shows which page each one belongs to: on this
 * screen alone, two adjacent rows can be owned by different people.
 *
 * Each article is its own row, so Save writes the open one and only the open one.
 * Position is the exception: it belongs to the list rather than to any row, so a
 * drag saves itself, debounced, without touching anything else.
 */

/** A drag crosses several rows; wait for it to settle before writing. */
const ORDER_SAVE_DELAY = 500;

export function ArticlesEditor({
  initialArticles,
  siteUrl,
}: {
  initialArticles: Article[];
  /**
   * Where the public site answers. The admin is on a different hostname, so a
   * relative link to an article from here would resolve against the admin host.
   */
  siteUrl: string;
}) {
  // The sport this screen belongs to. Every write below names it, so the
  // server guards the right one — see SiteScope.
  const site = useSite();
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [saved, setSaved] = useState<Article[]>(initialArticles);

  const [activeId, setActiveId] = useState<string | null>(initialArticles[0]?.id ?? null);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the server tidied on the last write, and WHICH article it tidied. */
  const [notes, setNotes] = useState<{ id: string; list: string[] } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [adding, setAdding] = useState(false);

  const active = articles.find((article) => article.id === activeId) ?? null;
  const activeSaved = saved.find((article) => article.id === activeId) ?? null;

  /*
   * Everything belonging to the OPEN article is dropped when a different one is
   * opened — the delete confirmation above all. Left standing it is a red button
   * aimed at whichever article is now selected, which is the one unrecoverable
   * action on the screen fired by a stale flag.
   */
  useEffect(() => {
    setConfirmingDelete(false);
    setJustSaved(false);
    setError(null);
    setAdding(false);
  }, [activeId]);

  /*
   * Position is not compared: the list owns it and saves it on its own.
   *
   * A shallow per-key compare, like the decks screen. It works for `body` because
   * the two lists share one object reference until something changes it: the
   * editor hands up a NEW document on every keystroke, and a save replaces both
   * copies with the server's single object. Reference equality is therefore
   * exactly "has this been touched since it was last acknowledged".
   */
  const dirty =
    active && activeSaved
      ? (Object.keys(active) as (keyof Article)[]).some(
          (key) => key !== "sort_order" && active[key] !== activeSaved[key]
        )
      : false;

  /* ─────────────────────────── Order ─────────────────────────── */

  const savedOrder = useRef(initialArticles.map((article) => article.id).join(","));
  const orderTimer = useRef<number | null>(null);
  const pendingOrder = useRef<string[] | null>(null);

  // A drag left in flight when the screen closes is FLUSHED, not dropped.
  useEffect(() => {
    return () => {
      if (orderTimer.current === null) return;
      window.clearTimeout(orderTimer.current);

      const ids = pendingOrder.current;
      if (!ids || ids.join(",") === savedOrder.current) return;

      void fetch(withSite("/api/admin/articles", site), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        keepalive: true,
      });
    };
  }, []);

  async function writeOrder(ids: string[]) {
    const key = ids.join(",");
    if (key === savedOrder.current) return;

    setError(null);

    try {
      const response = await fetch(withSite("/api/admin/articles", site), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not save the new order.");
        return;
      }

      // Only after it has landed, so a failed reorder can still be retried.
      savedOrder.current = key;
    } catch {
      setError("Network error while saving the order.");
    }
  }

  function queueOrder(list: Article[]) {
    pendingOrder.current = list.map((article) => article.id);

    if (orderTimer.current !== null) window.clearTimeout(orderTimer.current);
    orderTimer.current = window.setTimeout(() => {
      orderTimer.current = null;
      const ids = pendingOrder.current;
      if (ids) void writeOrder(ids);
    }, ORDER_SAVE_DELAY);
  }

  /** Moves `fromId` to the place `toId` currently holds. */
  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;

    setArticles((current) => {
      const from = current.findIndex((article) => article.id === fromId);
      const to = current.findIndex((article) => article.id === toId);
      if (from < 0 || to < 0) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);

      queueOrder(next);
      return next;
    });
  }

  /* ─────────────────────────── Writes ─────────────────────────── */

  async function handleSave() {
    if (!active) return;

    setBusy(true);
    setError(null);
    setNotes(null);

    try {
      const response = await fetch(withSite(`/api/admin/articles/${active.id}`, site), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(active),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not save this article.");
        return;
      }

      /*
       * The server's copy replaces the draft, and here that is not merely tidy —
       * it is required. A change of address or of page MOVES the article's folder
       * and rewrites every picture in the body to the new one. Keeping the sent
       * copy would leave the editor holding addresses that no longer exist, and
       * the next save would write them back over the rewritten rows.
       */
      const article = data.article as Article;
      setArticles((current) => current.map((a) => (a.id === article.id ? article : a)));
      setSaved((current) => current.map((a) => (a.id === article.id ? article : a)));
      setNotes({ id: article.id, list: Array.isArray(data.notes) ? data.notes : [] });
      setJustSaved(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Creates the article at the title and address the panel collected.
   *
   * The page it starts on is the first one this account may write — for an owner
   * that is "all pages", and for a page editor their own. A new article is never
   * created somewhere its author cannot then open it.
   */
  async function handleCreate(title: string, slug: string) {
    setBusy(true);
    setError(null);
    setNotes(null);


    try {
      const response = await fetch(withSite("/api/admin/articles", site), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BLANK_ARTICLE,
          title,
          slug,
          sort_order:
            articles.reduce((top, article) => Math.max(top, article.sort_order), 0) + 10,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Left open, holding what was typed. The address is the likely reason,
        // and closing the panel would throw away the title along with it.
        setError(data.error ?? "Could not add an article.");
        return;
      }

      const article = data.article as Article;
      setArticles((current) => [...current, article]);
      setSaved((current) => [...current, article]);
      savedOrder.current = [...articles.map((a) => a.id), article.id].join(",");
      setActiveId(article.id);
      setAdding(false);
      setNotes({ id: article.id, list: Array.isArray(data.notes) ? data.notes : [] });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * An address handed over from another article's history, dropped from the copy
   * of that article held on this screen.
   */
  function forgetSlug(holder: SlugHolder, slug: string) {
    const drop = (article: Article) =>
      article.id === holder.id
        ? { ...article, former_slugs: article.former_slugs.filter((entry) => entry !== slug) }
        : article;

    setArticles((current) => current.map(drop));
    setSaved((current) => current.map(drop));
  }

  async function handleDelete() {
    if (!active) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(withSite(`/api/admin/articles/${active.id}`, site), { method: "DELETE" });

      // A 404 means it is already gone, which is what was being asked for.
      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not delete this article.");
        return;
      }

      const gone = active.id;
      const remaining = articles.filter((article) => article.id !== gone);

      // Open a neighbour rather than nothing: an empty right-hand pane after a
      // delete reads as a screen that has broken.
      const position = articles.findIndex((article) => article.id === gone);
      setActiveId(remaining[Math.min(position, remaining.length - 1)]?.id ?? null);

      setArticles(remaining);
      setSaved((current) => current.filter((article) => article.id !== gone));
      savedOrder.current = remaining.map((article) => article.id).join(",");
      setConfirmingDelete(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function update(next: Article) {
    setArticles((current) => current.map((a) => (a.id === next.id ? next : a)));
    setJustSaved(false);
  }

  /* ─────────────────────────── Screen ─────────────────────────── */

  const railItems: RailItem<string>[] = articles.map((article, index) => ({
    id: article.id,
    short: article.title || "Untitled article",
    title: `${String(index + 1).padStart(2, "0")} · ${article.title || "Untitled article"}`,
    // No owner to name any more: every row on this screen belongs to the sport
    // the screen is for. Just whether anybody outside the admin can read it.
    hint: ARTICLE_STATUS_LABELS[article.status],
    // Present so the rail lets them be dragged. No `onToggleVisible` is passed,
    // so no eye appears: an article is not switched off, it is set back to draft.
    visible: true,
    Icon: NewsIcon,
  }));

  /*
   * Where this article's pictures go — from the SAVED record, never the draft.
   *
   * Only the address is editable here — the sport is fixed by the screen. Using
   * the draft would upload into a folder named after a half-typed slug, and
   * abandoning the save would leave that file orphaned in a folder that never
   * comes to exist. `activeSaved` is
   * the last thing the server acknowledged, so it always names a folder that is
   * real. The rename carries the files across; see the PUT in
   * src/app/api/admin/articles/[id]/route.ts.
   */
  const uploadFolder = activeSaved
    ? folderForEntity(site.slug, "articles", activeSaved.slug, activeSaved.id)
    : folderForModule(site.slug, "articles");

  return (
    <UploadFolder folder={uploadFolder}>
      <div className="flex min-h-0 flex-col gap-2 md:h-full">
        <AdminRailSlot>
          <SectionRail
            heading="Articles"
            items={railItems}
            active={activeId ?? ""}
            onSelect={setActiveId}
            onReorder={reorder}
          />
        </AdminRailSlot>

        <EditorToolbar
          Icon={NewsIcon}
          title={active ? active.title || "Untitled article" : "Articles"}
          hint={
            adding
              ? "Give the new article a title and an address."
              : active
                ? "Drag the sidebar to set the order they are listed in."
                : "No articles yet — write the first one."
          }
          dirty={dirty}
          justSaved={justSaved}
          busy={busy}
          // Said once. While the new-article panel is open it owns the failure,
          // because the field that caused it is in that panel.
          error={adding ? null : error}
          onSave={handleSave}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(true);
                setConfirmingDelete(false);
                setError(null);
                setNotes(null);
              }}
              disabled={busy || adding}
            >
              <PlusIcon />
              Add article
            </Button>
          }
          fieldsOpen={fieldsOpen}
          onToggleFields={() => setFieldsOpen((open) => !open)}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
          {/* Hidden below lg: at that width the fields already fill the screen,
              and a preview shrunk into what is left would be unreadable. */}
          <ArticlePreview
            article={adding ? null : active}
            className="hidden lg:block lg:min-w-0 lg:flex-1"
          />

          <div
            className={cn(
              "min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card md:overflow-y-auto",
              fieldsOpen ? "lg:w-[440px] lg:flex-none xl:w-[520px]" : "lg:hidden"
            )}
          >
            <div className="space-y-2.5 bg-background/40 p-3">
              {/* Anything the server had to change on the way in. Silence here is
                  how an address quietly stops being the one on the poster. */}
              {active && notes && notes.id === active.id && notes.list.length > 0 ? (
                <Panel title="Saved, with changes">
                  <ul className="space-y-1">
                    {notes.list.map((note) => (
                      <li key={note} className="text-xs leading-relaxed text-foreground">
                        {note}
                      </li>
                    ))}
                  </ul>
                  <Note className="mt-2">
                    These are what the server tidied up. Nothing else was touched.
                  </Note>
                </Panel>
              ) : null}

              {adding ? (
                <NewRecord
                  kind="article"
                  title="New article"
                  namePlaceholder="Season opener at Kari"
                  busy={busy}
                  error={error}
                  onCreate={handleCreate}
                  onCancel={() => {
                    setAdding(false);
                    setError(null);
                  }}
                  onReleased={forgetSlug}
                />
              ) : active ? (
                confirmingDelete ? (
                  <div className="space-y-2.5 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                    <p className="text-xs leading-relaxed text-foreground">
                      Delete{" "}
                      <span className="font-medium">{active.title || "this article"}</span>? Its
                      address stops working and everything written in it is gone. This cannot be
                      undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={busy}
                      >
                        {busy ? "Deleting…" : "Delete article"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingDelete(false)}
                        disabled={busy}
                      >
                        Keep it
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ArticleForm
                    article={active}
                    siteUrl={siteUrl}
                    onChange={update}
                    onDelete={() => setConfirmingDelete(true)}
                    onReleasedSlug={forgetSlug}
                    busy={busy}
                  />
                )
              ) : (
                <p className="rounded-md border border-dashed border-input px-4 py-10 text-center text-xs text-muted-fg">
                  No articles yet. Use <span className="text-foreground">Add article</span> above to
                  write the first one.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </UploadFolder>
  );
}
