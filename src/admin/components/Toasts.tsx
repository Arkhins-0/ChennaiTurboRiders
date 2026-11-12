"use client";

import { useEffect, useRef, useState } from "react";
import { XIcon } from "@/admin/ui/icons";

/*
 * Short messages at the bottom of the screen ("Saved", "Couldn't upload").
 * `toast("Saved")` or `toast({ text, tone, action })` from any client
 * component; <Toasts /> is mounted once, in the console's shell. Without it
 * mounted (the sign-in page), a toast simply isn't shown.
 */

export type ToastTone = "info" | "success" | "error";
/** An action: a button (`onClick`) or a link to another site (`href`, opened in a new tab). */
export type ToastAction = { label: string; onClick?: () => void; href?: string };
/**
 * `onDone`: called when the bar goes without its action being taken (it timed
 * out, was dismissed or was pushed off by newer bars) — the moment to carry out
 * what Undo would have stopped.
 */
export type ToastInput =
  | string
  | { text: string; tone?: ToastTone; action?: ToastAction; duration?: number; onDone?: () => void };

type Item = { id: number; text: string; tone: ToastTone; action?: ToastAction; duration: number; onDone?: () => void };

const SHOWN = 4;
const DURATION_MS = 4_500;
// Long enough to read the message and still reach the button.
const WITH_ACTION_MS = 8_000;

const listeners = new Set<(item: Item) => void>();
let seq = 0;

/** Show a message bar. A plain string is an info message. */
export function toast(input: ToastInput): void {
  const t = typeof input === "string" ? { text: input } : input;
  const item: Item = {
    id: ++seq,
    text: t.text,
    tone: t.tone ?? "info",
    action: t.action,
    duration: t.duration ?? (t.action ? WITH_ACTION_MS : DURATION_MS),
    onDone: t.onDone,
  };
  listeners.forEach((listener) => listener(item));
}

/** A failed save or upload, in the server's own words when it gave some. */
export function toastError(error: unknown, fallback = "Something went wrong. Try again."): void {
  toast({ text: error instanceof Error && error.message ? error.message : fallback, tone: "error" });
}

const STRIPE: Record<ToastTone, string> = { info: "bg-faint", success: "bg-primary", error: "bg-destructive" };

/** Where the messages show: full width on a phone, bottom right on a laptop; the newest lowest. */
export function Toasts() {
  const [items, setItems] = useState<Item[]>([]);
  // The same list, readable outside a render: a bar that goes tells its `onDone` exactly once.
  const list = useRef<Item[]>([]);
  const show = (next: Item[]) => {
    list.current = next;
    setItems(next);
  };

  useEffect(() => {
    // Past four, the oldest goes: a burst of messages never covers the page.
    const add = (item: Item) => {
      const next = [...list.current, item];
      next.splice(0, Math.max(0, next.length - SHOWN)).forEach((gone) => gone.onDone?.());
      show(next);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  const close = (id: number, acted = false) => {
    const gone = list.current.find((x) => x.id === id);
    show(list.current.filter((x) => x.id !== id));
    if (!acted) gone?.onDone?.();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col gap-2 px-4 font-ui sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96 sm:px-0">
      {items.map((t) => (
        <ToastBar key={t.id} t={t} onClose={() => close(t.id)} onAct={() => close(t.id, true)} />
      ))}
    </div>
  );
}

function ToastBar({ t, onClose, onAct }: { t: Item; onClose: () => void; onAct: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const left = useRef(t.duration);
  const close = useRef(onClose);
  close.current = onClose;

  // The clock stops while the pointer or focus is on it, and carries on after.
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => close.current(), left.current);
    return () => {
      window.clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [paused]);

  // A click closes it, but not one that ends selecting its text: that text is there to be copied.
  const clicked = () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && box.current?.contains(selection.anchorNode)) return;
    onClose();
  };

  return (
    <div
      ref={box}
      role={t.tone === "error" ? "alert" : "status"}
      className="toast-in pointer-events-auto flex cursor-pointer select-text items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-pop"
      onClick={clicked}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={`w-1 shrink-0 ${STRIPE[t.tone]}`} aria-hidden />
      <p className="min-w-0 flex-1 break-words px-4 py-3 text-[13px] text-foreground">{t.text}</p>
      {t.action?.href ? (
        <a
          href={t.action.href}
          target="_blank"
          rel="noopener"
          className="flex shrink-0 items-center px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10"
          onClick={(event) => {
            event.stopPropagation();
            onAct();
          }}
        >
          {t.action.label}
        </a>
      ) : t.action ? (
        <button
          type="button"
          className="shrink-0 px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10"
          onClick={(event) => {
            event.stopPropagation();
            t.action?.onClick?.();
            onAct();
          }}
        >
          {t.action.label}
        </button>
      ) : null}
      {/* For the keyboard: the bar itself isn't focusable. */}
      <button
        type="button"
        className="grid w-10 shrink-0 place-items-center text-faint transition-colors hover:text-foreground"
        aria-label="Dismiss"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
