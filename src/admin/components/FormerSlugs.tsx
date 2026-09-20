"use client";

import type { SlugKind } from "@/lib/slug";
import { siteHref } from "@/lib/sites";
import { Button } from "@/admin/ui/Button";
import { Label } from "@/admin/ui/Input";
import { XIcon } from "@/admin/ui/icons";
import { Hint } from "@/admin/components/Fields";
import { useSite } from "@/admin/components/SiteScope";

/**
 * The addresses this thing used to live at, and a way to retire one.
 *
 * The list itself was only ever shown for decks, and only as a sentence — so a
 * form's old addresses were invisible, and neither kind could be edited at all.
 * That is the half of the redirect history nobody could see: an address typed
 * once, corrected a second later, was answered for by that record forever, and
 * the only sign of it was a different record being refused that address months
 * afterwards with no way to find out why.
 *
 * Removing one here is a change to the record like any other — it lands on
 * Save, alongside everything else on the panel, and the server says out loud
 * what it retired. The server will only ever let this list SHRINK; see the note
 * on `updateForm`.
 */

/**
 * The route each kind publishes under. The SPORT in front of it comes from the
 * surrounding scope — an address is `/news/<slug>`, and this component is
 * used on every sport's screens.
 */
const ROUTE: Record<SlugKind, string> = {
  article: "news",
  // A round has no page of its own on this site; its address is where it is
  // listed. See `eventHref` in src/lib/events.ts.
  event: "schedule",
};

export function FormerSlugs({
  kind,
  slugs,
  onChange,
  disabled,
}: {
  kind: SlugKind;
  slugs: string[];
  onChange: (slugs: string[]) => void;
  disabled?: boolean;
}) {
  /* The sport this screen belongs to — see the note on ROUTE above. */
  const site = useSite();
  const prefix = `${siteHref(site)}/${ROUTE[kind]}/`;

  if (slugs.length === 0) return null;

  return (
    <div className="block">
      <Label>Old addresses</Label>

      <ul className="mt-1.5 space-y-1">
        {slugs.map((slug) => (
          <li
            key={slug}
            className="flex items-center gap-2 rounded-md border border-border bg-background/60 py-1 ps-2.5 pe-1"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
              {prefix}
              {slug}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onChange(slugs.filter((entry) => entry !== slug))}
              disabled={disabled}
              title={`Stop answering to ${prefix}${slug}`}
              aria-label={`Stop answering to ${prefix}${slug}`}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>

      <Hint className="mt-1">
        These still redirect here, which is what keeps a printed link or a QR code working.
        Removing one takes effect on Save — the address stops finding this {kind} and is free for
        something else to use.
      </Hint>
    </div>
  );
}
