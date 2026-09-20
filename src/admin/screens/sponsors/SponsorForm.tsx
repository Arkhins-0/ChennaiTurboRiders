"use client";

import { SPONSOR_TIERS, SPONSOR_TIER_LABELS, type Sponsor } from "@/types/site";
import { normaliseSponsorTier } from "@/lib/team";
import { Button } from "@/admin/ui/Button";
import { TrashIcon } from "@/admin/ui/icons";
import { Label, Select } from "@/admin/ui/Input";
import { Field, Hint, Panel, TextArea } from "@/admin/components/Fields";
import { ImageField } from "@/admin/components/ImageField";

/**
 * One sponsor's record.
 *
 * Presentational, like `DriverForm`: no state, no request. The editor above
 * owns the draft and the save.
 */
export function SponsorForm({
  sponsor,
  onChange,
  onDelete,
  busy,
}: {
  sponsor: Sponsor;
  onChange: (sponsor: Sponsor) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const set = (patch: Partial<Sponsor>) => onChange({ ...sponsor, ...patch });

  return (
    <div className="space-y-2.5">
      <Panel title="Partner">
        <div className="space-y-3">
          <Field
            label="Name"
            value={sponsor.name}
            onChange={(name) => set({ name })}
            placeholder="Bharath College"
          />

          <label className="block">
            <Label>Tier</Label>
            <Select
              value={sponsor.tier}
              onChange={(event) => set({ tier: normaliseSponsorTier(event.target.value) })}
              className="mt-1.5"
            >
              {SPONSOR_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {SPONSOR_TIER_LABELS[tier]}
                </option>
              ))}
            </Select>
            <Hint className="mt-1">
              Which band of /sponsors this appears in. The marquee on the home page shows the first
              three; a technical partner is on /sponsors only.
            </Hint>
          </label>

          <Field
            label="Website"
            value={sponsor.website}
            onChange={(website) => set({ website })}
            placeholder="https://…"
            hint="Blank leaves the logo unlinked."
          />

          <TextArea
            label="Description"
            value={sponsor.description ?? ""}
            onChange={(description) => set({ description })}
            rows={4}
          />
        </div>
      </Panel>

      <Panel title="Logos">
        <div className="space-y-3">
          <ImageField
            label="Mark"
            value={sponsor.logo}
            onChange={(logo) => set({ logo })}
            variant="logo"
            hint="What the marquee scrolls. Usually the symbol on its own."
          />
          <ImageField
            label="Wordmark"
            value={sponsor.fullLogo ?? ""}
            onChange={(fullLogo) => set({ fullLogo })}
            variant="logo"
            hint="The wider card on /sponsors. Blank uses the mark."
          />
        </div>
      </Panel>

      <div className="flex justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={busy}>
          <TrashIcon />
          Delete sponsor
        </Button>
      </div>
    </div>
  );
}
