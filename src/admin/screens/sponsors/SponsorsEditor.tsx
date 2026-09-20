"use client";

import { useEffect, useRef, useState } from "react";
import { folderForEntity, folderForModule } from "@/lib/mediaPaths";
import { BLANK_SPONSOR } from "@/lib/team";
import { cn } from "@/lib/utils";
import { SPONSOR_TIER_LABELS, type Sponsor } from "@/types/site";
import { Button } from "@/admin/ui/Button";
import { HandshakeIcon, PlusIcon } from "@/admin/ui/icons";
import { AdminRailSlot } from "@/admin/components/AdminShell";
import { EditorToolbar } from "@/admin/components/EditorToolbar";
import { SectionRail, type RailItem } from "@/admin/components/SectionRail";
import { useSite, withSite } from "@/admin/components/SiteScope";
import { UploadFolder } from "@/admin/components/UploadFolder";
import { SponsorForm } from "./SponsorForm";

/**
 * The partner board.
 *
 * The same screen as the drivers, with one difference worth stating: the rail
 * is ordered by TIER first and position second, because that is how the public
 * board reads. Dragging still sets the order — the ids go over in the order the
 * rail draws them, and the server numbers them down that list, which preserves
 * the relative order inside each band. See the note on the PATCH handler.
 *
 * Changing a sponsor's tier therefore moves it in the rail on the next save
 * rather than while you are dragging, which is the honest behaviour: the tier
 * is a field of the record and the position is a property of the list.
 */

const ORDER_SAVE_DELAY = 500;

export function SponsorsEditor({ initialSponsors }: { initialSponsors: Sponsor[] }) {
  const site = useSite();

  const [sponsors, setSponsors] = useState<Sponsor[]>(initialSponsors);
  const [saved, setSaved] = useState<Sponsor[]>(initialSponsors);

  const [activeId, setActiveId] = useState<string | null>(initialSponsors[0]?.id ?? null);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const active = sponsors.find((sponsor) => sponsor.id === activeId) ?? null;
  const activeSaved = saved.find((sponsor) => sponsor.id === activeId) ?? null;

  const dirty = active && activeSaved ? JSON.stringify(active) !== JSON.stringify(activeSaved) : false;

  /* ─────────────────────────── Order ─────────────────────────── */

  const savedOrder = useRef(initialSponsors.map((sponsor) => sponsor.id).join(","));
  const orderTimer = useRef<number | null>(null);
  const pendingOrder = useRef<string[] | null>(null);

  useEffect(() => {
    return () => {
      if (orderTimer.current !== null) window.clearTimeout(orderTimer.current);
    };
  }, []);

  async function writeOrder(ids: string[]) {
    const key = ids.join(",");
    if (key === savedOrder.current) return;

    savedOrder.current = key;
    setError(null);

    try {
      const response = await fetch(withSite("/api/admin/sponsors", site), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not save the new order.");
      }
    } catch {
      setError("Network error while saving the order.");
    }
  }

  function queueOrder(list: Sponsor[]) {
    pendingOrder.current = list.map((sponsor) => sponsor.id);

    if (orderTimer.current !== null) window.clearTimeout(orderTimer.current);
    orderTimer.current = window.setTimeout(() => {
      orderTimer.current = null;
      const ids = pendingOrder.current;
      if (ids) void writeOrder(ids);
    }, ORDER_SAVE_DELAY);
  }

  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;

    setSponsors((current) => {
      const from = current.findIndex((sponsor) => sponsor.id === fromId);
      const to = current.findIndex((sponsor) => sponsor.id === toId);
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
    setNote(null);

    try {
      const response = await fetch(withSite(`/api/admin/sponsors/${active.id}`, site), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(active),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not save this sponsor.");
        return;
      }

      const sponsor = data.sponsor as Sponsor;
      setSponsors((current) => current.map((s) => (s.id === sponsor.id ? sponsor : s)));
      setSaved((current) => current.map((s) => (s.id === sponsor.id ? sponsor : s)));
      setJustSaved(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const response = await fetch(withSite("/api/admin/sponsors", site), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...BLANK_SPONSOR, name: "New sponsor" }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not add a sponsor.");
        return;
      }

      const sponsor = data.sponsor as Sponsor;
      setSponsors((current) => [...current, sponsor]);
      setSaved((current) => [...current, sponsor]);
      savedOrder.current = [...sponsors.map((s) => s.id), sponsor.id].join(",");
      setActiveId(sponsor.id);
      setJustSaved(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!active) return;

    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const response = await fetch(withSite(`/api/admin/sponsors/${active.id}`, site), {
        method: "DELETE",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not delete this sponsor.");
        return;
      }

      const gone = active.id;
      const remaining = sponsors.filter((sponsor) => sponsor.id !== gone);

      const position = sponsors.findIndex((sponsor) => sponsor.id === gone);
      setActiveId(remaining[Math.min(position, remaining.length - 1)]?.id ?? null);

      setSponsors(remaining);
      setSaved((current) => current.filter((sponsor) => sponsor.id !== gone));
      savedOrder.current = remaining.map((sponsor) => sponsor.id).join(",");
      setConfirmingDelete(false);

      const notes = Array.isArray(data.notes) ? (data.notes as string[]) : [];
      if (notes.length > 0) setNote(notes.join(" "));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function update(next: Sponsor) {
    setSponsors((current) => current.map((sponsor) => (sponsor.id === next.id ? next : sponsor)));
    setJustSaved(false);
  }

  /* ─────────────────────────── Screen ─────────────────────────── */

  const railItems: RailItem<string>[] = sponsors.map((sponsor, index) => ({
    id: sponsor.id,
    short: sponsor.name || "Untitled sponsor",
    title: `${String(index + 1).padStart(2, "0")} · ${sponsor.name || "Untitled sponsor"}`,
    hint: SPONSOR_TIER_LABELS[sponsor.tier],
    visible: true,
    Icon: HandshakeIcon,
  }));

  const uploadFolder = activeSaved
    ? folderForEntity(site.slug, "sponsors", activeSaved.slug, activeSaved.id)
    : folderForModule(site.slug, "sponsors");

  return (
    <UploadFolder folder={uploadFolder}>
      <div className="flex min-h-0 flex-col gap-2 md:h-full">
        <AdminRailSlot>
          <SectionRail
            heading="Sponsors"
            items={railItems}
            active={activeId ?? ""}
            onSelect={setActiveId}
            onReorder={reorder}
          />
        </AdminRailSlot>

        <EditorToolbar
          Icon={HandshakeIcon}
          title={active ? active.name || "Untitled sponsor" : "Sponsors"}
          hint={
            active
              ? "Drag the sidebar to set the order within each tier."
              : "No sponsors yet — add the first one."
          }
          dirty={dirty}
          justSaved={justSaved}
          busy={busy}
          error={error}
          onSave={handleSave}
          actions={
            <Button variant="outline" size="sm" onClick={handleAdd} disabled={busy}>
              <PlusIcon />
              Add sponsor
            </Button>
          }
          fieldsOpen={fieldsOpen}
          onToggleFields={() => setFieldsOpen((open) => !open)}
        />

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card",
            fieldsOpen ? "" : "hidden"
          )}
        >
          <div className="mx-auto max-w-3xl space-y-2.5 bg-background/40 p-3">
            {note ? (
              <p className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-fg">
                {note}
              </p>
            ) : null}

            {active ? (
              confirmingDelete ? (
                <div className="space-y-2.5 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                  <p className="text-xs leading-relaxed text-foreground">
                    Delete <span className="font-medium">{active.name || "this sponsor"}</span>? This
                    cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
                      {busy ? "Deleting…" : "Delete sponsor"}
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
                <SponsorForm
                  sponsor={active}
                  onChange={update}
                  onDelete={() => setConfirmingDelete(true)}
                  busy={busy}
                />
              )
            ) : (
              <p className="rounded-md border border-dashed border-input px-4 py-10 text-center text-xs text-muted-fg">
                No sponsors yet. Use <span className="text-foreground">Add sponsor</span> above to
                make the first one.
              </p>
            )}
          </div>
        </div>
      </div>
    </UploadFolder>
  );
}
