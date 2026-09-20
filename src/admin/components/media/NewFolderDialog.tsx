"use client";

import { useEffect, useState } from "react";
import { SEGMENT_MESSAGES, segmentProblem } from "@/lib/mediaPaths";
import { Button } from "@/admin/ui/Button";
import { Dialog } from "@/admin/ui/Dialog";
import { Input, Label } from "@/admin/ui/Input";
import { ErrorNote, Hint } from "@/admin/components/Fields";

/**
 * A new folder inside the one being browsed.
 *
 * The name is validated AS IT IS TYPED, against the very same rule the route
 * applies — `src/lib/mediaPaths.ts` is deliberately not `server-only` so that
 * both halves ask one function and cannot drift apart. The reward is that a
 * rejection is explained while somebody is still typing rather than after a
 * round trip.
 *
 * One sentence per rule, never a single "Invalid name." for six of them: a
 * dialog that refuses without saying which rule broke is one people type at
 * until they give up.
 */
export function NewFolderDialog({
  open,
  onClose,
  parent,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  parent: string;
  onCreated: (folder: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  // Nothing typed yet is not a complaint, it is just the starting state.
  const problem = name === "" ? null : segmentProblem(name);

  async function create() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/media/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent, name }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not make that folder.");
        return;
      }

      onCreated(data.folder as string);
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New folder"
      description={parent ? `Inside ${parent}` : "At the top level"}
      className="max-w-md"
    >
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <label className="block">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name && !problem && !busy) create();
          }}
          disabled={busy}
          placeholder="2026 season"
          autoFocus
          className="mt-1.5"
        />
        {problem ? (
          <p role="alert" className="mt-1 text-[11px] text-destructive">
            {SEGMENT_MESSAGES[problem]}
          </p>
        ) : (
          <Hint className="mt-1">Letters, numbers, spaces, hyphens and underscores.</Hint>
        )}
      </label>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={create} disabled={busy || !name || Boolean(problem)}>
          {busy ? "Making…" : "Make folder"}
        </Button>
      </div>
    </Dialog>
  );
}
