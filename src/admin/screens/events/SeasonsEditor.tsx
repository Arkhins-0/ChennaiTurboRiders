"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  SEASON_STATUS_LABELS,
  positionLabel,
  type Championship,
  type LineupEntry,
  type Season,
} from "@/lib/seasons";
import { eventDateLabel } from "@/lib/raceDates";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { Input, Label, Select } from "@/admin/ui/Input";
import { CalendarIcon, PlusIcon, TrophyIcon } from "@/admin/ui/icons";
import { useSite, withSite } from "@/admin/components/SiteScope";
import { AdminRailSlot } from "@/admin/components/AdminShell";
import { EditorToolbar } from "@/admin/components/EditorToolbar";
import { Field, Hint, Note, Panel, Row, TextArea } from "@/admin/components/Fields";
import { SectionRail, type RailItem } from "@/admin/components/SectionRail";

/**
 * The team's seasons: one per league per year, past and future alike.
 *
 * A season the team is about to race and a season it raced in 2022 are the same
 * record at different times — the league, the car, who drove, the rounds — and
 * the only thing a finished one adds is where the team ended up. So this one
 * screen is both the calendar's front door and the history's editor: add next
 * year's season here, add its rounds, and once it is run fill in the result.
 * /schedule shows the season that is running and /history the ones that ran.
 *
 * The rounds themselves keep their own editor (pictures, circuit, write-up);
 * this screen lists them and links there.
 */

export type SeasonRow = Season & { rounds: number; lineup: LineupEntry[] };
export type RoundRow = { id: string; season_id: string; round: string; venue: string; date_from: string; date_to: string; dates: string; status: string };
export type RosterDriver = { id: string; name: string; nationality: string };

type Draft = SeasonRow;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Text field → number or null, so an emptied box means "not recorded". */
const num = (value: string) => (value.trim() === "" || Number.isNaN(Number(value)) ? null : Number(value));
const str = (value: number | null) => (value == null ? "" : String(value));

export function SeasonsEditor({
  initialSeasons,
  initialChampionships,
  rounds,
  roster,
}: {
  initialSeasons: SeasonRow[];
  initialChampionships: Championship[];
  rounds: RoundRow[];
  roster: RosterDriver[];
}) {
  const site = useSite();
  const [seasons, setSeasons] = useState<Draft[]>(initialSeasons);
  const [saved, setSaved] = useState<Draft[]>(initialSeasons);
  const [championships, setChampionships] = useState(initialChampionships);
  const [activeId, setActiveId] = useState<string | null>(initialSeasons[0]?.id ?? null);

  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  const [adding, setAdding] = useState(false);
  const [newLeague, setNewLeague] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const active = seasons.find((s) => s.id === activeId) ?? null;
  const activeSaved = saved.find((s) => s.id === activeId) ?? null;
  const dirty = Boolean(active && activeSaved && !same(active, activeSaved));

  const leagueName = (id: string) => championships.find((c) => c.id === id);

  function select(id: string) {
    if (dirty && !window.confirm("This season has unsaved changes. Leave it without saving?")) return;
    // Throw the unsaved draft away rather than carry it.
    setSeasons((list) => list.map((s) => (s.id === activeId ? (saved.find((x) => x.id === s.id) ?? s) : s)));
    setActiveId(id);
    setError(null);
    setNotes([]);
    setConfirmingDelete(false);
    setAdding(false);
  }

  function patch(change: Partial<Draft>) {
    if (!active) return;
    setSeasons((list) => list.map((s) => (s.id === active.id ? { ...s, ...change } : s)));
    setJustSaved(false);
  }

  function patchLineup(index: number, change: Partial<LineupEntry>) {
    if (!active) return;
    patch({ lineup: active.lineup.map((row, i) => (i === index ? { ...row, ...change } : row)) });
  }

  function moveLineup(index: number, step: number) {
    if (!active) return;
    const next = [...active.lineup];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ lineup: next });
  }

  /* ─────────────────────────── Writes ─────────────────────────── */

  async function handleSave() {
    if (!active) return;
    setBusy(true);
    setError(null);
    setNotes([]);

    try {
      const response = await fetch(withSite(`/api/admin/seasons/${active.id}`, site), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(active),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not save the season.");
        return;
      }

      const fresh: Draft = { ...data.season, rounds: active.rounds, lineup: data.lineup ?? active.lineup };
      setSeasons((list) => list.map((s) => (s.id === fresh.id ? fresh : s)));
      setSaved((list) => list.map((s) => (s.id === fresh.id ? fresh : s)));
      setNotes(data.notes ?? []);
      setJustSaved(true);
    } catch {
      setError("Network error while saving the season.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(form: { name: string; year: string; championship_id: string }) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(withSite("/api/admin/seasons", site), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          year: num(form.year),
          sort_order: num(form.year) ?? 0,
          championship_id: form.championship_id,
          status: "draft",
          lineup: [],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not add the season.");
        return;
      }

      const created: Draft = { ...data.season, rounds: 0, lineup: [] };
      const order = (list: Draft[]) =>
        [...list, created].sort((a, b) => b.sort_order - a.sort_order || b.name.localeCompare(a.name));
      setSeasons(order);
      setSaved(order);
      setActiveId(created.id);
      setAdding(false);
      setNotes(data.notes ?? []);
    } catch {
      setError("Network error while adding the season.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddLeague(name: string) {
    const response = await fetch(withSite("/api/admin/championships", site), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Could not add the league.");
      return null;
    }
    const league = data.championship as Championship;
    setChampionships((list) => (list.some((c) => c.id === league.id) ? list : [...list, league]));
    return league;
  }

  async function handleDelete() {
    if (!active) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        withSite(`/api/admin/seasons/${active.id}?rounds=${active.rounds}`, site),
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not delete the season.");
        return;
      }
      const rest = seasons.filter((s) => s.id !== active.id);
      setSeasons(rest);
      setSaved((list) => list.filter((s) => s.id !== active.id));
      setActiveId(rest[0]?.id ?? null);
      setConfirmingDelete(false);
      setNotes(data.notes ?? []);
    } catch {
      setError("Network error while deleting the season.");
    } finally {
      setBusy(false);
    }
  }

  /* ─────────────────────────── Screen ─────────────────────────── */

  const railItems: RailItem<string>[] = seasons.map((s) => {
    const league = leagueName(s.championship_id);
    const result = s.team_result || positionLabel(s.team_position);
    return {
      id: s.id,
      short: s.name || "Untitled season",
      title: [s.year, league?.short_name || league?.name].filter(Boolean).join(" · ") || s.name || "Untitled season",
      hint: [
        `${s.rounds} round${s.rounds === 1 ? "" : "s"}`,
        result || (s.status === "draft" ? "Draft" : ""),
      ]
        .filter(Boolean)
        .join(" · "),
      Icon: result ? TrophyIcon : CalendarIcon,
    };
  });

  const activeRounds = useMemo(
    () => (active ? rounds.filter((r) => r.season_id === active.id) : []),
    [rounds, active]
  );

  const roundsHref = active ? `/site/${site.slug}/events/rounds?season=${active.id}` : "";

  return (
    <div className="flex min-h-0 flex-col gap-2 md:h-full">
      <AdminRailSlot>
        <SectionRail heading="Seasons" items={railItems} active={activeId ?? ""} onSelect={select} />
      </AdminRailSlot>

      <EditorToolbar
        Icon={TrophyIcon}
        title={adding ? "New season" : active ? active.name || "Untitled season" : "Seasons"}
        hint={
          adding
            ? "Name the league and the year. Rounds and drivers come next."
            : active
              ? "League, car, lineup and how the team finished."
              : "No seasons yet — add the first one."
        }
        dirty={dirty}
        justSaved={justSaved}
        busy={busy}
        error={error}
        onSave={handleSave}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAdding(true);
              setConfirmingDelete(false);
              setError(null);
            }}
            disabled={busy || adding}
          >
            <PlusIcon />
            Add season
          </Button>
        }
        fieldsOpen={fieldsOpen}
        onToggleFields={() => setFieldsOpen((open) => !open)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-3 pb-10">
          {notes.length > 0 ? (
            <Note>
              {notes.map((n) => (
                <span key={n} className="block">
                  {n}
                </span>
              ))}
            </Note>
          ) : null}

          {adding ? (
            <NewSeason
              championships={championships}
              busy={busy}
              onAddLeague={handleAddLeague}
              onCreate={handleCreate}
              onCancel={() => setAdding(false)}
            />
          ) : null}

          {active && !adding ? (
            <>
              <Panel title="Season" hint="What the calendar and the history call it.">
                <div className="space-y-3">
                  <Row>
                    <Field label="Name" value={active.name} onChange={(name) => patch({ name })} placeholder="2026 Indian Racing League" />
                    <label className="block">
                      <Label>Year</Label>
                      <Input
                        className="mt-1.5"
                        inputMode="numeric"
                        value={str(active.year)}
                        onChange={(e) => {
                          const year = num(e.target.value);
                          patch({ year, sort_order: year ?? active.sort_order });
                        }}
                        placeholder="2026"
                      />
                    </label>
                  </Row>
                  <Row>
                    <label className="block">
                      <Label>League</Label>
                      <div className="mt-1.5 flex gap-2">
                        <Select
                          value={active.championship_id}
                          onChange={(e) => patch({ championship_id: e.target.value })}
                        >
                          <option value="">Not filed under a league</option>
                          {championships.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                        <Button variant="outline" size="md" onClick={() => setNewLeague("")} title="Add a league">
                          <PlusIcon />
                        </Button>
                      </div>
                      {newLeague !== null ? (
                        <div className="mt-2 flex gap-2">
                          <Input
                            autoFocus
                            value={newLeague}
                            onChange={(e) => setNewLeague(e.target.value)}
                            placeholder="Name of the league"
                          />
                          <Button
                            size="md"
                            disabled={!newLeague.trim()}
                            onClick={async () => {
                              const league = await handleAddLeague(newLeague.trim());
                              if (league) {
                                patch({ championship_id: league.id });
                                setNewLeague(null);
                              }
                            }}
                          >
                            Add
                          </Button>
                          <Button variant="ghost" size="md" onClick={() => setNewLeague(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </label>
                    <label className="block">
                      <Label>Status</Label>
                      <Select
                        className="mt-1.5"
                        value={active.status}
                        onChange={(e) => patch({ status: e.target.value as Draft["status"] })}
                      >
                        {Object.entries(SEASON_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <Hint className="mt-1">A draft season is on neither /schedule nor /history.</Hint>
                    </label>
                  </Row>
                  <Field
                    label="Line under the title"
                    value={active.subtitle}
                    onChange={(subtitle) => patch({ subtitle })}
                    placeholder="Every round of the season, as it stands."
                  />
                  <Field
                    label="Car"
                    value={active.car}
                    onChange={(car) => patch({ car })}
                    placeholder="Wolf GB08 Thunder, with a 215 bhp Aprilia engine"
                  />
                </div>
              </Panel>

              <Panel title="Drivers" hint="Who raced for the team. Linked rows show on that driver's profile.">
                <div className="space-y-2">
                  {active.lineup.length === 0 ? (
                    <p className="text-[13px] text-muted-fg">Nobody in the lineup yet.</p>
                  ) : (
                    <div className="hidden grid-cols-[1.2fr_1.2fr_1fr_5rem_auto] gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-fg sm:grid">
                      <span>Profile</span>
                      <span>Name</span>
                      <span>Nationality</span>
                      <span>Points</span>
                      <span className="w-[5.5rem]" />
                    </div>
                  )}
                  {active.lineup.map((row, i) => (
                    <div
                      key={i}
                      className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1.2fr_1.2fr_1fr_5rem_auto] sm:border-0 sm:p-0"
                    >
                      <Select
                        aria-label="Driver profile"
                        value={row.driver_id}
                        onChange={(e) => {
                          const d = roster.find((x) => x.id === e.target.value);
                          patchLineup(i, d ? { driver_id: d.id, name: d.name, nationality: d.nationality || row.nationality } : { driver_id: "" });
                        }}
                      >
                        <option value="">No profile</option>
                        {roster.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                      <Input aria-label="Name" value={row.name} onChange={(e) => patchLineup(i, { name: e.target.value })} placeholder="Name" />
                      <Input
                        aria-label="Nationality"
                        value={row.nationality}
                        onChange={(e) => patchLineup(i, { nationality: e.target.value })}
                        placeholder="Nationality"
                      />
                      <Input
                        aria-label="Points"
                        inputMode="decimal"
                        value={str(row.points)}
                        onChange={(e) => patchLineup(i, { points: num(e.target.value) })}
                        placeholder="—"
                      />
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => moveLineup(i, -1)} disabled={i === 0} aria-label="Move up">
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => moveLineup(i, 1)}
                          disabled={i === active.lineup.length - 1}
                          aria-label="Move down"
                        >
                          ↓
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="hover:text-destructive"
                          onClick={() => patch({ lineup: active.lineup.filter((_, j) => j !== i) })}
                          aria-label={`Remove ${row.name || "this driver"}`}
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => patch({ lineup: [...active.lineup, { driver_id: "", name: "", nationality: "", points: null }] })}
                  >
                    <PlusIcon />
                    Add driver
                  </Button>
                </div>
              </Panel>

              <Panel title="Team result" hint="Leave blank while the season is still running.">
                <div className="space-y-3">
                  <Row>
                    <label className="block">
                      <Label>Final position</Label>
                      <Input
                        className="mt-1.5"
                        inputMode="numeric"
                        value={str(active.team_position)}
                        onChange={(e) => patch({ team_position: num(e.target.value) })}
                        placeholder="—"
                      />
                    </label>
                    <label className="block">
                      <Label>Team points</Label>
                      <Input
                        className="mt-1.5"
                        inputMode="decimal"
                        value={str(active.team_points)}
                        onChange={(e) => patch({ team_points: num(e.target.value) })}
                        placeholder="—"
                      />
                    </label>
                  </Row>
                  <Field
                    label="Result as the site says it"
                    value={active.team_result}
                    onChange={(team_result) => patch({ team_result })}
                    placeholder={positionLabel(active.team_position) || "—"}
                    hint="Blank uses the position: 2 reads “Runner-up”, 4 reads “4th”."
                  />
                  <Field
                    label="Driver title"
                    value={active.champion}
                    onChange={(champion) => patch({ champion })}
                    placeholder="Cooper Webster — 7 wins, 9 podiums, 282.5 points"
                    hint="When one of the team's drivers won the championship."
                  />
                  <TextArea label="Notes" value={active.notes} onChange={(n) => patch({ notes: n })} rows={3} />
                </div>
              </Panel>

              <Panel title="Rounds" hint={`${activeRounds.length} on the calendar`}>
                <div className="space-y-3">
                  {activeRounds.length > 0 ? (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {activeRounds.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                          <span className="w-8 shrink-0 tabular-nums text-muted-fg">{r.round || "—"}</span>
                          <span className="min-w-0 flex-1 truncate text-foreground">{r.venue || "No venue yet"}</span>
                          <span className="shrink-0 text-muted-fg">{eventDateLabel(r) || "No date"}</span>
                          {r.status !== "published" ? (
                            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-fg">Draft</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-muted-fg">No rounds yet.</p>
                  )}
                  <Link
                    href={roundsHref}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-[13px] font-medium text-foreground transition hover:bg-muted"
                    )}
                    onClick={(e) => {
                      if (dirty && !window.confirm("This season has unsaved changes. Leave without saving?")) e.preventDefault();
                    }}
                  >
                    <CalendarIcon className="size-3.5" />
                    {activeRounds.length > 0 ? "Edit rounds" : "Add rounds"}
                  </Link>
                </div>
              </Panel>

              <Panel title="Delete season">
                {confirmingDelete ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="mr-auto text-[13px] text-foreground">
                      {active.rounds > 0
                        ? `Delete ${active.name} and its ${active.rounds} round${active.rounds === 1 ? "" : "s"}? This cannot be undone.`
                        : `Delete ${active.name}? This cannot be undone.`}
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                      Keep it
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
                      Delete
                    </Button>
                  </div>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmingDelete(true)}>
                    Delete this season…
                  </Button>
                )}
              </Panel>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NewSeason({
  championships,
  busy,
  onAddLeague,
  onCreate,
  onCancel,
}: {
  championships: Championship[];
  busy: boolean;
  onAddLeague: (name: string) => Promise<Championship | null>;
  onCreate: (form: { name: string; year: string; championship_id: string }) => void;
  onCancel: () => void;
}) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [league, setLeague] = useState(championships[0]?.id ?? "");
  const [typedLeague, setTypedLeague] = useState("");
  const [name, setName] = useState("");

  const leagueName = championships.find((c) => c.id === league)?.name ?? "";
  const suggested = [year, leagueName].filter(Boolean).join(" ") || `${year} Season`;

  return (
    <Panel title="New season">
      <div className="space-y-3">
        <Row>
          <label className="block">
            <Label>Year</Label>
            <Input className="mt-1.5" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
          </label>
          <label className="block">
            <Label>League</Label>
            <Select className="mt-1.5" value={league} onChange={(e) => setLeague(e.target.value)}>
              {championships.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">A new league…</option>
              <option value="">None</option>
            </Select>
          </label>
        </Row>
        {league === "__new" ? (
          <Field label="Name of the new league" value={typedLeague} onChange={setTypedLeague} placeholder="Indian F4 Championship" />
        ) : null}
        <Field label="Name" value={name} onChange={setName} placeholder={suggested} hint="Blank uses the year and the league." />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || (league === "__new" && !typedLeague.trim())}
            onClick={async () => {
              let id = league;
              let label = leagueName;
              if (league === "__new") {
                const created = await onAddLeague(typedLeague.trim());
                if (!created) return;
                id = created.id;
                label = created.name;
              }
              onCreate({ name: name.trim() || [year, label].filter(Boolean).join(" ") || `${year} Season`, year, championship_id: id });
            }}
          >
            Add season
          </Button>
        </div>
      </div>
    </Panel>
  );
}
