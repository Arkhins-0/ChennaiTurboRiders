"use client";

import { MAX_HIGHLIGHTS } from "@/lib/team";
import type { Driver, DriverStats } from "@/types/site";
import { Button } from "@/admin/ui/Button";
import { TrashIcon } from "@/admin/ui/icons";
import { Field, Hint, Panel, Row, TextArea } from "@/admin/components/Fields";
import { Label } from "@/admin/ui/Input";
import { ImageField } from "@/admin/components/ImageField";
import { Repeater } from "@/admin/components/Repeater";

/**
 * One driver's record.
 *
 * Presentational: it holds no state and no request. Every change is handed
 * straight up as a whole `Driver`, and `DriversEditor` owns the draft, the
 * dirty check and the save — the same split `TrackForm` and `TracksEditor`
 * use, and for the same reason: the list has to know whether the open record
 * has unsaved changes, and it cannot if the record keeps them to itself.
 */

/** The six counters, in the order the driver's page prints them. */
const STATS: { key: keyof DriverStats; label: string }[] = [
  { key: "grandPrix", label: "Grands Prix" },
  { key: "raceWins", label: "Wins" },
  { key: "podiums", label: "Podiums" },
  { key: "polePositions", label: "Poles" },
  { key: "fastestLaps", label: "Fastest laps" },
  { key: "points", label: "Points" },
];

/** A highlight is a bare string, and `Repeater` wants objects with stable keys. */
type Highlight = { text: string };

export function DriverForm({
  driver,
  onChange,
  onDelete,
  busy,
}: {
  driver: Driver;
  onChange: (driver: Driver) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const set = (patch: Partial<Driver>) => onChange({ ...driver, ...patch });

  const setStat = (key: keyof DriverStats, value: string) =>
    onChange({ ...driver, stats: { ...driver.stats, [key]: Number(value) || 0 } });

  const highlights: Highlight[] = driver.careerHighlights.map((text) => ({ text }));

  return (
    <div className="space-y-2.5">
      <Panel title="Name" hint="The address is made from this once, when the driver is created.">
        <div className="space-y-3">
          <Row>
            <Field label="First name" value={driver.firstName} onChange={(firstName) => set({ firstName })} />
            <Field label="Last name" value={driver.lastName} onChange={(lastName) => set({ lastName })} />
          </Row>
          <Row>
            <Field
              label="Number"
              value={driver.number ? String(driver.number) : ""}
              onChange={(value) => set({ number: Number(value) || 0 })}
              placeholder="7"
              hint="0 leaves it off the card."
            />
            {/*
              Shown, not edited. The address is minted once by `freeSlug` when
              the driver is created and frozen after — ctr.slugs cannot hold a
              driver, so there is nowhere to record the redirect a moved address
              would need, and their media folder is named after it. A disabled
              input would say the same thing while looking like a field that is
              merely switched off, so it is plain text.
            */}
            <div>
              <Label>Address</Label>
              <p className="mt-1.5 truncate rounded-md border border-input bg-background/60 px-2.5 py-1.5 font-mono text-[12px] text-muted-fg">
                /drivers/{driver.slug}
              </p>
              <Hint className="mt-1">Set when the driver was added. Links point at it.</Hint>
            </div>
          </Row>
        </div>
      </Panel>

      <Panel title="Where they race">
        <div className="space-y-3">
          <Row>
            <Field
              label="Championship"
              value={driver.championship ?? ""}
              onChange={(championship) => set({ championship })}
              placeholder="IRL"
              hint="Groups the roster on /drivers. Use the same spelling for teammates."
            />
            <Field
              label="Car"
              value={driver.car ?? ""}
              onChange={(car) => set({ car })}
              placeholder="Wolf GB08"
            />
          </Row>
          <Row>
            <Field
              label="Nationality"
              value={driver.nationality}
              onChange={(nationality) => set({ nationality })}
              placeholder="India"
            />
            <Field
              label="Country code"
              value={driver.countryCode}
              onChange={(countryCode) => set({ countryCode })}
              placeholder="IN"
            />
          </Row>
          <Row>
            <Field
              label="Flag"
              value={driver.flagEmoji}
              onChange={(flagEmoji) => set({ flagEmoji })}
              placeholder="🇮🇳"
              hint="The emoji itself, which is what the card draws."
            />
            <Field
              label="Date of birth"
              value={driver.dateOfBirth}
              onChange={(dateOfBirth) => set({ dateOfBirth })}
              placeholder="2003-05-12"
              hint="YYYY-MM-DD. Blank is allowed."
            />
          </Row>
          <Row>
            <Field label="Height" value={driver.height} onChange={(height) => set({ height })} placeholder="1.75 M" />
            <Field label="Weight" value={driver.weight} onChange={(weight) => set({ weight })} placeholder="68 KG" />
          </Row>
        </div>
      </Panel>

      <Panel title="Pictures">
        <div className="space-y-3">
          <ImageField
            label="Portrait"
            value={driver.image}
            onChange={(image) => set({ image })}
            hint="The card on /drivers and the reel on the home page."
          />
          <ImageField
            label="Wide plate"
            value={driver.heroImage}
            onChange={(heroImage) => set({ heroImage })}
            hint="The top of their own page. The portrait is used when this is blank."
          />
        </div>
      </Panel>

      <Panel title="Words">
        <div className="space-y-3">
          <TextArea label="Quote" value={driver.quote} onChange={(quote) => set({ quote })} rows={3} />
          <TextArea
            label="Biography"
            value={driver.biography}
            onChange={(biography) => set({ biography })}
            rows={7}
            hint="The first 155 characters are the page's share text."
          />
        </div>
      </Panel>

      <Panel title="Record" hint="Whole numbers. 0 is shown as 0, not hidden.">
        <div className="grid gap-3 sm:grid-cols-2">
          {STATS.map((stat) => (
            <Field
              key={stat.key}
              label={stat.label}
              value={driver.stats[stat.key] ? String(driver.stats[stat.key]) : "0"}
              onChange={(value) => setStat(stat.key, value)}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Career highlights">
        <Repeater<Highlight>
          title="Highlights"
          addLabel="Add highlight"
          items={highlights}
          max={MAX_HIGHLIGHTS}
          onChange={(next) => set({ careerHighlights: next.map((entry) => entry.text) })}
          blank={() => ({ text: "" })}
          summary={(entry) => ({ title: entry.text || "Empty line" })}
          expand="accordion"
          empty="No highlights yet."
        >
          {(entry, _index, patchEntry) => (
            <Field
              label="Highlight"
              value={entry.text}
              onChange={(text) => patchEntry({ text })}
              placeholder="National Karting Champion 2022"
            />
          )}
        </Repeater>
      </Panel>

      <div className="flex justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={busy}>
          <TrashIcon />
          Delete driver
        </Button>
      </div>
    </div>
  );
}
