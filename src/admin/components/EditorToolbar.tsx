"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/admin/ui/Badge";
import { Button } from "@/admin/ui/Button";
import { PanelIcon } from "@/admin/ui/icons";
import { ErrorNote } from "@/admin/components/Fields";

/**
 * The bar across the top of an editor.
 *
 * Everything about the page as a whole lives here — what section is open,
 * whether it is saved, and the two buttons that write — because it is the only
 * part of the screen that neither sidebar can hide. Both panes fold away; this
 * does not, so Save is never more than one glance from wherever the work is.
 *
 * It is also where the right-hand pane is reopened from. A pane that collapses
 * to nothing needs its handle kept somewhere that cannot itself be collapsed.
 */
export function EditorToolbar({
  Icon,
  title,
  hint,
  dirty,
  justSaved,
  busy,
  error,
  onSave,
  actions,
  fieldsOpen,
  onToggleFields,
  className,
}: {
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  title: string;
  hint: string;
  dirty: boolean;
  justSaved: boolean;
  busy: boolean;
  error: string | null;
  onSave: () => void;
  /** Screen-specific buttons, placed before Save. */
  actions?: React.ReactNode;
  fieldsOpen: boolean;
  onToggleFields: () => void;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 space-y-2", className)}>
      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
        <Icon className="size-5 shrink-0 text-muted-fg" />

        <div className="mr-auto min-w-0">
          <h1 className="truncate text-[13px] font-medium tracking-tight text-foreground">
            {title}
          </h1>
          <p className="truncate text-[11px] text-muted-fg">{hint}</p>
        </div>

        {dirty ? (
          <Badge variant="default">Unsaved</Badge>
        ) : justSaved ? (
          <span className="shrink-0 text-[11px] text-muted-fg">Saved</span>
        ) : null}

        {actions}

        {/* "Load defaults" was here. It refilled the open panel from
            DEFAULT_LANDING_CONTENT / DEFAULT_INCRC_CONTENT — a second copy of
            the site's words kept in the repo. Those are gone: the pages are rows
            now, seeded once from scripts/seed-data, and there is no built-in
            copy left for a button to honestly restore. Undo is the browser's
            back button before Save, and the original wording is a re-run of the
            seed against an empty table. */}
        <Button onClick={onSave} disabled={busy} size="sm">
          {busy ? "Saving…" : "Save"}
        </Button>

        <div className="hidden h-6 w-px bg-border lg:block" />

        {/* Mirrored, so this reads as the pane on the right the way the
            sidebar's own button reads as the pane on the left. */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleFields}
          aria-expanded={fieldsOpen}
          aria-label={fieldsOpen ? "Hide the fields" : "Show the fields"}
          title={fieldsOpen ? "Hide the fields" : "Show the fields"}
          className="hidden lg:flex"
        >
          <PanelIcon className="scale-x-[-1]" />
        </Button>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
