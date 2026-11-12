"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { XIcon } from "./icons";

/**
 * A modal, as a workspace's: a white panel near the top of the screen over a
 * light wash, its title and a quieter line in a header strip, a close button
 * on the right. Full width on a phone.
 *
 * Nothing is rendered while closed, so a dialog costs nothing until it is
 * opened. Escape closes it, and so does the backdrop — but only a press that
 * both starts and ends on the backdrop, otherwise a text selection that drifts
 * out of the panel would dismiss it.
 *
 * `font-ui` is on the overlay because a dialog may be rendered outside the
 * shell's subtree, and the console's base rules (options, focus) key on it.
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
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 font-ui backdrop-blur-[2px] sm:items-start sm:p-6 sm:pt-[8vh]"
    >
      <div
        className={cn(
          "flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-card text-card-fg shadow-pop sm:max-h-[84vh] sm:rounded-xl sm:border sm:border-border",
          className
        )}
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-3.5">
          <div className="mr-auto min-w-0">
            <h2 className="text-base font-semibold leading-tight text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-faint">{description}</p> : null}
          </div>

          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="-mr-1.5">
            <XIcon />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
