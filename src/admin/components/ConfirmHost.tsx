"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/admin/ui/Button";

/*
 * `askConfirm()` stands in for the browser's confirm(): a small dialog in the
 * console's look, answered with a promise.
 *
 *   if (await askConfirm({ title: "Delete this driver?", confirm: "Delete", danger: true })) …
 *
 * <ConfirmHost /> is mounted once, in the console's shell. Without it (the
 * sign-in page) every question answers `false`, which is the safe answer.
 */

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  /** The yes button's words. "OK" by default; say what it does instead. */
  confirm?: string;
  cancel?: string;
  /** The yes button in red: deleting, unpublishing. */
  danger?: boolean;
};

type Ask = ConfirmOptions & { resolve: (answer: boolean) => void };

const askers = new Set<(ask: Ask) => void>();

/** Ask a yes/no question. Resolves true for the confirm button, false otherwise. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (askers.size === 0) return Promise.resolve(false);
  return new Promise((resolve) => askers.forEach((asker) => asker({ ...options, resolve })));
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<Ask[]>([]);

  useEffect(() => {
    const add = (ask: Ask) => setQueue((current) => [...current, ask]);
    askers.add(add);
    return () => {
      askers.delete(add);
    };
  }, []);

  const current = queue[0];
  if (!current) return null;

  return (
    <ConfirmDialog
      key={queue.length}
      ask={current}
      onAnswer={(answer) => {
        current.resolve(answer);
        setQueue((list) => list.slice(1));
      }}
    />
  );
}

function ConfirmDialog({ ask, onAnswer }: { ask: ConfirmOptions; onAnswer: (answer: boolean) => void }) {
  const titleId = useId();
  const yes = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    yes.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onAnswer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
    // Once per question: `onAnswer` is a new function on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/30 font-ui backdrop-blur-[2px] sm:items-start sm:p-6 sm:pt-[14vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onAnswer(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full bg-card text-foreground shadow-pop sm:max-w-md sm:rounded-xl sm:border sm:border-border"
      >
        <div className="px-5 pb-2 pt-4">
          <h2 id={titleId} className="text-base font-semibold leading-tight">
            {ask.title}
          </h2>
          {ask.body ? <div className="mt-1.5 text-[13px] leading-relaxed text-muted-fg">{ask.body}</div> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-4 pt-3">
          <Button variant="outline" size="sm" onClick={() => onAnswer(false)}>
            {ask.cancel ?? "Cancel"}
          </Button>
          {/* A plain button so it can take the ref: Button does not forward one. */}
          <button
            ref={yes}
            type="button"
            className={buttonClass(ask.danger ? "destructive" : "default", "sm")}
            onClick={() => onAnswer(true)}
          >
            {ask.confirm ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
