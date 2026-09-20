"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { XIcon } from "./icons";

/**
 * A modal.
 *
 * The overlay is a blur rather than a wash of black: the workspace stays
 * recognisable behind it, which makes the dialog read as something on top of the
 * page rather than a new page.
 *
 * Nothing is rendered while closed, so a dialog costs nothing until it is
 * opened. Escape closes it, and so does the backdrop — but only a press that
 * both starts and ends on the backdrop, otherwise a text selection that drifts
 * out of the panel would dismiss it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div
        className={cn(
          "flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card font-ui text-card-fg",
          className
        )}
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="mr-auto min-w-0">
            <h2 className="font-medium tracking-tight text-foreground">{title}</h2>
            {description ? <p className="text-xs text-muted-fg">{description}</p> : null}
          </div>

          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <XIcon />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
