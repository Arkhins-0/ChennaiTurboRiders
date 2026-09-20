"use client";

import { useState } from "react";
import { folderForModule } from "@/lib/mediaPaths";
import { MAX_CAR_SPECS, MAX_STATS } from "@/lib/team";
import type { Achievement, CarSpec, CarSpecs, TeamContent, TeamStat } from "@/types/site";
import { Button } from "@/admin/ui/Button";
import { FlagIcon } from "@/admin/ui/icons";
import { AdminRailSlot } from "@/admin/components/AdminShell";
import { EditorToolbar } from "@/admin/components/EditorToolbar";
import { Field, Panel, Row, TextArea } from "@/admin/components/Fields";
import { ImageField } from "@/admin/components/ImageField";
import { Repeater } from "@/admin/components/Repeater";
import { SectionRail, type RailItem } from "@/admin/components/SectionRail";
import { useSite, withSite } from "@/admin/components/SiteScope";
import { UploadFolder } from "@/admin/components/UploadFolder";

/**
 * Everything the site says about itself, on one screen with one Save.
 *
 * ── Why this is one screen and the drivers are another ────────────────────
 *
 * Because of what a save MEANS. A driver is a record: it is added, edited and
 * deleted on its own, and the roster is a list of them. None of this is. The
 * team has one name, one hero, one car and one timeline, and they are edited in
 * a single sitting when the site is set up and barely touched after — so the
 * unit of work is the document, not the field.
 *
 * That is why the rail here lists SECTIONS of one form rather than records:
 * picking one scrolls to it. The circuits editor's rail picks which record is
 * open, and the two look alike on purpose — what is in the rail is always
 * "the thing this screen is a list of".
 *
 * ── Why there is no preview ───────────────────────────────────────────────
 *
 * The other editors draw one because they edit a page made of sections, and a
 * section is hard to picture from its fields. These fields are a name, an
 * address and a photograph: what they will look like is not in doubt, and a
 * preview would be a second copy of the public components to keep in step for
 * no information. The fields take the full width instead.
 */

/** The parts of the form, in the order they appear. Also the rail. */
const SECTIONS = [
  { id: "team", label: "The team", hint: "Name, tagline, championship" },
  { id: "hero", label: "Hero", hint: "The first screen of the home page" },
  { id: "about", label: "About", hint: "The copy on the home page and /about" },
  { id: "car", label: "The car", hint: "The machine panel and its specification" },
  { id: "achievements", label: "Journey", hint: "The timeline on /about" },
  { id: "contact", label: "Contact", hint: "The footer block and the map" },
  { id: "social", label: "Social", hint: "The four icons in the header and footer" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function IdentityEditor({
  initialTeam,
  initialCar,
  initialAchievements,
}: {
  initialTeam: TeamContent;
  initialCar: CarSpecs;
  initialAchievements: Achievement[];
}) {
  const site = useSite();

  const [team, setTeam] = useState<TeamContent>(initialTeam);
  const [car, setCar] = useState<CarSpecs>(initialCar);
  const [achievements, setAchievements] = useState<Achievement[]>(initialAchievements);

  /*
   * The last saved copy, compared against the draft to decide whether Save is
   * live. Serialised rather than compared field by field: this document is
   * nested four deep in places, and a hand-written comparison would be the one
   * thing on the screen that quietly stops noticing a field somebody adds.
   */
  const [saved, setSaved] = useState(() =>
    JSON.stringify({ team: initialTeam, car: initialCar, achievements: initialAchievements })
  );

  const [active, setActive] = useState<SectionId>("team");
  const [fieldsOpen, setFieldsOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = JSON.stringify({ team, car, achievements });
  const dirty = draft !== saved;

  /** Merges into one branch of the profile without spreading the whole thing. */
  function patch<K extends keyof TeamContent>(key: K, value: Partial<TeamContent[K]>) {
    setTeam((current) => ({ ...current, [key]: { ...current[key], ...value } }));
    setJustSaved(false);
  }

  function patchCar(value: Partial<CarSpecs>) {
    setCar((current) => ({ ...current, ...value }));
    setJustSaved(false);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(withSite("/api/admin/identity", site), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, car, achievements }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not save the site's details.");
        return;
      }

      /*
       * Replaced with what the server actually stored, not merely marked clean.
       * Every field here goes through a normaliser that trims, clamps and
       * refuses an unusable link, so the draft and the row can differ after a
       * successful save — and the screen should show the row.
       */
      setTeam(data.team as TeamContent);
      setCar(data.car as CarSpecs);
      setAchievements(data.achievements as Achievement[]);
      setSaved(JSON.stringify({ team: data.team, car: data.car, achievements: data.achievements }));
      setJustSaved(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const railItems: RailItem<SectionId>[] = SECTIONS.map((section) => ({
    id: section.id,
    short: section.label,
    title: section.label,
    hint: section.hint,
    Icon: FlagIcon,
  }));

  /*
   * One folder for the whole screen, and no per-record folder beneath it: the
   * profile and the car are one row each, so there is no record to name one
   * after. See MODULE_FOLDERS in src/lib/mediaPaths.ts.
   */
  const uploadFolder = folderForModule(site.slug, "team");

  /** Jumps to a part of the form. The rail is a table of contents, not a switch. */
  function goTo(id: SectionId) {
    setActive(id);
    document.getElementById(`identity-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <UploadFolder folder={uploadFolder}>
      <div className="flex min-h-0 flex-col gap-2 md:h-full">
        <AdminRailSlot>
          <SectionRail heading="Team & site" items={railItems} active={active} onSelect={goTo} />
        </AdminRailSlot>

        <EditorToolbar
          Icon={FlagIcon}
          title="Team & site"
          hint="The name, the copy and the pictures the whole site is built from."
          dirty={dirty}
          justSaved={justSaved}
          busy={busy}
          error={error}
          onSave={handleSave}
          fieldsOpen={fieldsOpen}
          onToggleFields={() => setFieldsOpen((open) => !open)}
        />

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card">
          <div className="mx-auto max-w-3xl space-y-2.5 bg-background/40 p-3">
            {/* ── The team ── */}
            <div id="identity-team">
              <Panel title="The team" hint="Printed in the masthead, the footer and every page title.">
                <div className="space-y-3">
                  <Row>
                    <Field
                      label="Name"
                      value={team.site.name}
                      onChange={(name) => patch("site", { name })}
                      placeholder="Chennai Turbo Riders"
                    />
                    <Field
                      label="Initials"
                      value={team.site.abbreviation}
                      onChange={(abbreviation) => patch("site", { abbreviation })}
                      placeholder="CTR"
                      hint="The breadcrumb over every inner page."
                    />
                  </Row>
                  <Field
                    label="Tagline"
                    value={team.site.tagline}
                    onChange={(tagline) => patch("site", { tagline })}
                    placeholder="Born to Race. Built to Win."
                  />
                  <TextArea
                    label="Description"
                    value={team.site.description}
                    onChange={(description) => patch("site", { description })}
                    rows={3}
                    hint="The standfirst on /about, and the site's default share text."
                  />
                  <Row>
                    <Field
                      label="Founded"
                      value={team.site.founded ? String(team.site.founded) : ""}
                      onChange={(value) => patch("site", { founded: Number(value) || 0 })}
                      placeholder="2022"
                    />
                    <Field
                      label="Current season"
                      value={team.site.currentSeason ? String(team.site.currentSeason) : ""}
                      onChange={(value) => patch("site", { currentSeason: Number(value) || 0 })}
                      placeholder="4"
                      hint="The S04 readout in the header."
                    />
                  </Row>
                  <Field
                    label="Championship"
                    value={team.site.championship}
                    onChange={(championship) => patch("site", { championship })}
                    placeholder="Indian Racing League (IRL)"
                  />
                  <Field
                    label="Official website"
                    value={team.site.officialWebsite}
                    onChange={(officialWebsite) => patch("site", { officialWebsite })}
                    placeholder="https://…"
                  />
                  <TextArea
                    label="Headquarters"
                    value={team.site.headquarters}
                    onChange={(headquarters) => patch("site", { headquarters })}
                    rows={2}
                  />
                </div>
              </Panel>
            </div>

            {/* ── Hero ── */}
            <div id="identity-hero">
              <Panel title="Hero" hint="The first screen of the home page.">
                <div className="space-y-3">
                  <Field
                    label="Title"
                    value={team.hero.title}
                    onChange={(title) => patch("hero", { title })}
                  />
                  <Field
                    label="Subtitle"
                    value={team.hero.subtitle}
                    onChange={(subtitle) => patch("hero", { subtitle })}
                  />
                  <TextArea
                    label="Description"
                    value={team.hero.description}
                    onChange={(description) => patch("hero", { description })}
                    rows={2}
                  />
                  <Field
                    label="Background video"
                    value={team.hero.videoSrc}
                    onChange={(videoSrc) => patch("hero", { videoSrc })}
                    placeholder="/video/background.mp4"
                    hint="A path under /public, or a full https:// address. Blank shows the car photograph instead."
                  />
                  <StatsRepeater
                    title="Counters"
                    addLabel="Add counter"
                    stats={team.hero.stats}
                    onChange={(stats) => patch("hero", { stats })}
                  />
                </div>
              </Panel>
            </div>

            {/* ── About ── */}
            <div id="identity-about">
              <Panel title="About" hint="The band on the home page, and the top of /about.">
                <div className="space-y-3">
                  <Row>
                    <Field
                      label="Heading"
                      value={team.about.title}
                      onChange={(title) => patch("about", { title })}
                    />
                    <Field
                      label="Label above it"
                      value={team.about.subtitle}
                      onChange={(subtitle) => patch("about", { subtitle })}
                    />
                  </Row>
                  <TextArea
                    label="Lead paragraph"
                    value={team.about.description}
                    onChange={(description) => patch("about", { description })}
                    rows={4}
                  />
                  <TextArea
                    label="Second paragraph"
                    value={team.about.description2}
                    onChange={(description2) => patch("about", { description2 })}
                    rows={4}
                    hint="Set smaller than the first. Blank leaves it out."
                  />
                  <ImageField
                    label="Team photograph"
                    value={team.about.image}
                    onChange={(image) => patch("about", { image })}
                  />
                  <StatsRepeater
                    title="Counters"
                    addLabel="Add counter"
                    stats={team.about.stats}
                    onChange={(stats) => patch("about", { stats })}
                  />

                  <div className="rounded-md border border-border bg-background/60 p-3">
                    <p className="mb-2 text-[11px] font-medium text-muted-fg">Team principal</p>
                    <div className="space-y-3">
                      <Row>
                        <Field
                          label="Name"
                          value={team.teamPrincipal.name}
                          onChange={(name) => patch("teamPrincipal", { name })}
                        />
                        <Field
                          label="Title"
                          value={team.teamPrincipal.title}
                          onChange={(title) => patch("teamPrincipal", { title })}
                          placeholder="Team Principal"
                        />
                      </Row>
                      <ImageField
                        label="Portrait"
                        value={team.teamPrincipal.image}
                        onChange={(image) => patch("teamPrincipal", { image })}
                      />
                    </div>
                  </div>
                </div>
              </Panel>
            </div>

            {/* ── The car ── */}
            <div id="identity-car">
              <Panel title="The car" hint="The machine panel on the home page.">
                <div className="space-y-3">
                  <Row>
                    <Field label="Name" value={car.name} onChange={(name) => patchCar({ name })} placeholder="GEN-2 F4" />
                    <Field
                      label="Year"
                      value={car.year ? String(car.year) : ""}
                      onChange={(value) => patchCar({ year: Number(value) || 0 })}
                      placeholder="2025"
                    />
                  </Row>
                  <Field label="Tagline" value={car.tagline} onChange={(tagline) => patchCar({ tagline })} />
                  <TextArea
                    label="Description"
                    value={car.description}
                    onChange={(description) => patchCar({ description })}
                    rows={4}
                  />
                  <ImageField label="Main photograph" value={car.image} onChange={(image) => patchCar({ image })} />
                  <Row>
                    <ImageField label="Detail 1" value={car.image2} onChange={(image2) => patchCar({ image2 })} />
                    <ImageField label="Detail 2" value={car.image3} onChange={(image3) => patchCar({ image3 })} />
                  </Row>

                  <Repeater<CarSpec>
                    title="Specification"
                    addLabel="Add row"
                    items={car.specs}
                    max={MAX_CAR_SPECS}
                    onChange={(specs) => patchCar({ specs })}
                    blank={() => ({ label: "", value: "" })}
                    summary={(spec) => ({
                      title: spec.label || "Untitled row",
                      hint: spec.value || "No value",
                    })}
                    expand="accordion"
                    empty="No specification rows yet."
                  >
                    {(spec, _index, patchSpec) => (
                      <Row>
                        <Field
                          label="Label"
                          value={spec.label}
                          onChange={(label) => patchSpec({ label })}
                          placeholder="Engine"
                        />
                        <Field
                          label="Value"
                          value={spec.value}
                          onChange={(value) => patchSpec({ value })}
                          placeholder="Turbo 1.4L"
                        />
                      </Row>
                    )}
                  </Repeater>
                </div>
              </Panel>
            </div>

            {/* ── Journey ── */}
            <div id="identity-achievements">
              <Panel title="Journey" hint="The timeline at the foot of /about, newest last.">
                <Repeater<Achievement>
                  title="Milestones"
                  addLabel="Add milestone"
                  items={achievements}
                  max={40}
                  onChange={(next) => {
                    setAchievements(next);
                    setJustSaved(false);
                  }}
                  /*
                   * A new milestone has no id until it has been saved — the ids
                   * are minted by the INSERT. Blank is fine: `keyOf` falls back
                   * to the index, and `saveAchievements` replaces the list
                   * wholesale rather than matching on them.
                   */
                  blank={() => ({ id: "", year: "", title: "", description: "" })}
                  keyOf={(item, index) => item.id || `new-${index}`}
                  summary={(item) => ({
                    title: item.title || "Untitled milestone",
                    hint: item.year || "No year",
                  })}
                  expand="accordion"
                  empty="No milestones yet."
                >
                  {(item, _index, patchItem) => (
                    <div className="space-y-3">
                      <Row>
                        <Field
                          label="Year"
                          value={item.year}
                          onChange={(year) => patchItem({ year })}
                          placeholder="2022"
                          hint="Text, so “2024–25” is allowed."
                        />
                        <Field
                          label="Heading"
                          value={item.title}
                          onChange={(title) => patchItem({ title })}
                        />
                      </Row>
                      <TextArea
                        label="Description"
                        value={item.description}
                        onChange={(description) => patchItem({ description })}
                        rows={3}
                      />
                    </div>
                  )}
                </Repeater>
              </Panel>
            </div>

            {/* ── Contact ── */}
            <div id="identity-contact">
              <Panel title="Contact" hint="The block in the footer, and the address on /sponsors.">
                <div className="space-y-3">
                  <Row>
                    <Field
                      label="Email"
                      value={team.contact.email}
                      onChange={(email) => patch("contact", { email })}
                    />
                    <Field
                      label="Phone"
                      value={team.contact.phone}
                      onChange={(phone) => patch("contact", { phone })}
                    />
                  </Row>
                  <TextArea
                    label="Address"
                    value={team.contact.address}
                    onChange={(address) => patch("contact", { address })}
                    rows={3}
                  />
                  <Field
                    label="Map embed"
                    value={team.contact.mapEmbed ?? ""}
                    onChange={(mapEmbed) => patch("contact", { mapEmbed })}
                    placeholder="https://www.google.com/maps/embed?…"
                    hint="The src of a Google Maps embed, not the whole <iframe>. Blank hides the map."
                  />
                </div>
              </Panel>
            </div>

            {/* ── Social ── */}
            <div id="identity-social">
              <Panel
                title="Social"
                hint="Leave one blank and its icon is not drawn, in the header or the footer."
              >
                <div className="space-y-3">
                  <Field
                    label="Instagram"
                    value={team.socialMedia.instagram}
                    onChange={(instagram) => patch("socialMedia", { instagram })}
                    placeholder="https://www.instagram.com/…"
                  />
                  <Field
                    label="Facebook"
                    value={team.socialMedia.facebook}
                    onChange={(facebook) => patch("socialMedia", { facebook })}
                    placeholder="https://www.facebook.com/…"
                  />
                  <Field
                    label="X"
                    value={team.socialMedia.twitter}
                    onChange={(twitter) => patch("socialMedia", { twitter })}
                    placeholder="https://twitter.com/…"
                  />
                  <Field
                    label="YouTube"
                    value={team.socialMedia.youtube}
                    onChange={(youtube) => patch("socialMedia", { youtube })}
                    placeholder="https://www.youtube.com/@…"
                  />
                </div>
              </Panel>
            </div>

            <div className="flex justify-end pb-6 pt-1">
              <Button onClick={handleSave} disabled={!dirty || busy} size="sm">
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </UploadFolder>
  );
}

/**
 * The counters, which appear twice — under the hero and beside the about copy.
 *
 * A component rather than the repeater written out in both places, because the
 * two are the same four fields with the same limit and the same blank, and the
 * one thing that must not happen is the hero's ceiling drifting from the
 * about's.
 */
function StatsRepeater({
  title,
  addLabel,
  stats,
  onChange,
}: {
  title: string;
  addLabel: string;
  stats: TeamStat[];
  onChange: (stats: TeamStat[]) => void;
}) {
  return (
    <Repeater<TeamStat>
      title={title}
      addLabel={addLabel}
      items={stats}
      max={MAX_STATS}
      onChange={onChange}
      blank={() => ({ value: "", label: "" })}
      summary={(stat) => ({ title: stat.value || "—", hint: stat.label || "No label" })}
      expand="accordion"
      empty="No counters yet."
    >
      {(stat, _index, patchStat) => (
        <Row>
          <Field
            label="Value"
            value={stat.value}
            onChange={(value) => patchStat({ value })}
            placeholder="11+"
            hint="Text, so a + or an S is allowed."
          />
          <Field
            label="Label"
            value={stat.label}
            onChange={(label) => patchStat({ label })}
            placeholder="Race wins"
          />
        </Row>
      )}
    </Repeater>
  );
}
