"use client";

import { useState } from "react";
import { slugify, type SlugHolder, type SlugKind } from "@/lib/slug";
import { Button } from "@/admin/ui/Button";
import { ErrorNote, Field, Note, Panel } from "@/admin/components/Fields";
import { SlugField, slugBlocked, type SlugState } from "@/admin/components/SlugField";

/**
 * The panel that stands between "Add" and a row in the database.
 *
 * Pressing Add used to post immediately, with the name hardcoded to "New form"
 * or "New deck". Every one of them therefore landed on `new-form` or
 * `new-deck` — and since that address is unique, the second one landed on
 * `new-form-2`, the third on `new-form-3`. Nothing was wrong with any single
 * row; the problem was the whole set. Every entry in the history looked the
 * same, so nothing could be told apart by its address, and a link copied out of
 * one of them pointed at whichever had been made first.
 *
 * So the address is asked for BEFORE the row exists. There is no default,
 * because a default is precisely what produced the collision, and the address
 * is the one field on these screens that gets printed and cannot be quietly
 * corrected afterwards.
 *
 * The name still suggests one, offered as a button rather than applied: a
 * suggestion the admin accepted is a decision, and a suggestion applied behind
 * their back is the old behaviour with extra steps.
 */
export function NewRecord({
  kind,
  title,
  namePlaceholder,
  busy,
  error,
  onCreate,
  onCancel,
  onReleased,
}: {
  kind: SlugKind;
  title: string;
  namePlaceholder: string;
  busy: boolean;
  error: string | null;
  onCreate: (name: string, slug: string) => void;
  onCancel: () => void;
  onReleased?: (holder: SlugHolder, slug: string) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [state, setState] = useState<SlugState>({ kind: "empty" });

  const named = name.trim() !== "";
  // Held back on `checking` too. Firing while the answer is in flight is how the
  // create races the check and comes back as the 409 this panel exists to avoid.
  const ready = named && !slugBlocked(state) && state.kind !== "checking" && !busy;

  return (
    <Panel title={title}>
      <div className="space-y-3">
        <Field
          label="Name"
          value={name}
          onChange={setName}
          placeholder={namePlaceholder}
          hint="What the admin and the cards on the site call it. This can change later."
        />

        <SlugField
          kind={kind}
          value={slug}
          onChange={setSlug}
          suggestion={slugify(name)}
          onState={setState}
          onReleased={onReleased}
          disabled={busy}
        />

        <div className="flex gap-2">
          <Button size="sm" onClick={() => onCreate(name.trim(), slug.trim())} disabled={!ready}>
            {busy ? "Creating…" : `Create ${kind}`}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Note>
          {named
            ? "The address is fixed at this point only in the sense that changing it later leaves the old one redirecting. Everything else is editable."
            : "Both are needed before this can be created."}
        </Note>
      </div>
    </Panel>
  );
}
