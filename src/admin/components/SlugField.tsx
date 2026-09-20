"use client";

import { useEffect, useRef, useState } from "react";
import { SLUG_MAX, isUsableSlug, type SlugCheck, type SlugHolder, type SlugKind } from "@/lib/slug";
import { siteHref } from "@/lib/sites";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { Label } from "@/admin/ui/Input";
import { Hint } from "@/admin/components/Fields";
import { useSite, withSite } from "@/admin/components/SiteScope";

/**
 * The address box, for the two things that have one.
 *
 * It asks the server who holds the address WHILE it is being typed, which is the
 * whole reason it exists as its own component rather than an `<Input>` in each
 * panel. The answer used to arrive as a 409 on Save — after the admin had
 * finished editing everything else, and phrased as a failure of the save rather
 * than of the one field that caused it.
 *
 * Three answers, three different things to do about them:
 *
 * FREE, or the address it already had — nothing to say beyond where it will
 * live.
 *
 * Held as somebody's CURRENT address — refused, and not offered as a choice.
 * Taking it would leave that form or deck with nowhere to be, which is not a
 * thing to do as a side effect of typing in a box on a different screen. The
 * message names it so the admin knows where to go.
 *
 * Held only in somebody's HISTORY — offered, with a button. That address is a
 * redirect and nothing else, and reusing one is a real thing to want: it is how
 * `2026-entry` moves from last season's form to this season's. Taking it is its
 * own click and its own request, so nothing about a Save silently rewrites
 * another record's redirects on the way past.
 */

/**
 * The route each kind publishes under. The SPORT in front of it comes from the
 * surrounding scope — an address is `/news/<slug>`, and this component is
 * used on every sport's screens.
 */
const ROUTE: Record<SlugKind, string> = {
  article: "news",
  // A round has no page of its own on this site — the calendar is one page —
  // so its address is where it is listed. See `eventHref` in src/lib/events.ts.
  event: "schedule",
};
const THING: Record<SlugKind, string> = {
  article: "article",
  event: "event",
};

/** What an address of this kind tends to look like, when nothing suggests one. */
const PLACEHOLDER: Record<SlugKind, string> = {
  article: "season-opener",
  event: "round-01",
};

/** Long enough that typing an address is one request, not fifteen. */
const CHECK_DELAY = 350;

export type SlugState =
  /** Nothing typed. For a new record that is not yet a usable address. */
  | { kind: "empty" }
  | { kind: "checking" }
  | { kind: "invalid" }
  | { kind: "free" }
  | { kind: "taken"; holder: SlugHolder }
  | { kind: "error"; message: string };

/** Whether a Save or a Create should be allowed to fire on this state. */
export function slugBlocked(state: SlugState): boolean {
  return state.kind === "taken" || state.kind === "invalid" || state.kind === "empty";
}

export function SlugField({
  kind,
  value,
  onChange,
  /** The record being edited, so its own address does not read as taken. */
  exceptId,
  /** Offered as a button rather than applied — the address outlives the name. */
  suggestion,
  onState,
  onReleased,
  disabled,
  autoFocus,
  label = "Address",
}: {
  kind: SlugKind;
  value: string;
  onChange: (slug: string) => void;
  exceptId?: string;
  suggestion?: string;
  onState?: (state: SlugState) => void;
  /** So the screen can drop the address from the record it was taken from. */
  onReleased?: (holder: SlugHolder, slug: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  // The sport this screen belongs to. Every write below names it, so the
  // server guards the right one — see SiteScope.
  const site = useSite();
  /* Where this record publishes: `/news/` for an article. */
  const prefix = `${siteHref(site)}/${ROUTE[kind]}/`;
  const [state, setState] = useState<SlugState>({ kind: "empty" });
  const [busy, setBusy] = useState(false);

  const slug = value.trim().toLowerCase();
  const canSuggest = Boolean(suggestion) && suggestion !== slug;

  /*
   * Reported through a ref rather than as an effect dependency.
   *
   * The parents pass an inline arrow, which is a new function every render, so
   * depending on it directly would re-run this on every keystroke of every other
   * field on the panel — and each of those re-runs would fire another check.
   */
  const report = useRef(onState);
  report.current = onState;

  useEffect(() => {
    report.current?.(state);
  }, [state]);

  useEffect(() => {
    if (!slug) {
      setState({ kind: "empty" });
      return;
    }

    // Answered here, without a request: the rule is the same one the server
    // applies, and a malformed address has no holder to look up anyway.
    if (!isUsableSlug(slug)) {
      setState({ kind: "invalid" });
      return;
    }

    setState({ kind: "checking" });

    const stop = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ kind, slug });
        if (exceptId) query.set("exceptId", exceptId);

        const response = await fetch(withSite(`/api/admin/slugs?${query}`, site), { signal: stop.signal });
        const data = (await response.json()) as SlugCheck & { error?: string };

        if (!response.ok) {
          setState({ kind: "error", message: data.error ?? "Could not check that address." });
          return;
        }

        setState(
          data.status === "taken"
            ? { kind: "taken", holder: data.holder }
            : data.status === "invalid"
              ? { kind: "invalid" }
              : { kind: "free" }
        );
      } catch (error) {
        // An aborted request is this effect being cleaned up, not a failure —
        // reporting it would leave the box red for an address nobody is on.
        if ((error as Error)?.name === "AbortError") return;
        setState({ kind: "error", message: "Could not reach the server to check that address." });
      }
    }, CHECK_DELAY);

    return () => {
      window.clearTimeout(timer);
      stop.abort();
    };
  }, [kind, slug, exceptId]);

  /** Frees a former address from whatever still redirects through it. */
  async function takeOver(holder: SlugHolder) {
    setBusy(true);

    try {
      const response = await fetch(withSite("/api/admin/slugs", site), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, slug, fromId: holder.id }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setState({ kind: "error", message: data.error ?? "Could not free that address." });
        return;
      }

      setState({ kind: "free" });
      onReleased?.(holder, slug);
    } catch {
      setState({ kind: "error", message: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const bad = state.kind === "taken" || state.kind === "invalid" || state.kind === "error";

  return (
    <div className="block">
      <Label>{label}</Label>

      <div
        className={cn(
          "mt-1.5 flex items-center gap-0 rounded-md border transition",
          "focus-within:ring-[3px] focus-within:ring-ring/40",
          bad ? "border-destructive/60" : "border-input focus-within:border-ring"
        )}
      >
        <span className="shrink-0 ps-2.5 text-sm text-muted-fg">{prefix}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          maxLength={SLUG_MAX}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={suggestion || PLACEHOLDER[kind]}
          className="h-9 min-w-0 flex-1 rounded-e-md border-0 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-fg/60 disabled:opacity-50"
        />

        {canSuggest ? (
          <Button
            variant="ghost"
            size="sm"
            className="me-1 shrink-0"
            onClick={() => onChange(suggestion ?? "")}
            disabled={disabled}
          >
            Use the name
          </Button>
        ) : null}
      </div>

      <Message
        kind={kind}
        prefix={prefix}
        slug={slug}
        state={state}
        busy={busy}
        disabled={disabled}
        onTakeOver={takeOver}
      />
    </div>
  );
}

/** The one line under the box. Every state says something; none of them lies. */
function Message({
  kind,
  prefix,
  slug,
  state,
  busy,
  disabled,
  onTakeOver,
}: {
  kind: SlugKind;
  /** The address this field publishes at, up to and including the last slash. */
  prefix: string;
  slug: string;
  state: SlugState;
  busy: boolean;
  disabled?: boolean;
  onTakeOver: (holder: SlugHolder) => void;
}) {
  if (state.kind === "empty") {
    return (
      <Hint className="mt-1">
        The page people go to. Pick it now — it is what gets printed, and moving it later means
        the old one has to keep working.
      </Hint>
    );
  }

  if (state.kind === "checking") {
    return <Hint className="mt-1">Checking whether that address is free…</Hint>;
  }

  if (state.kind === "invalid") {
    return (
      <Warning>
        Lower case letters, numbers and hyphens only, starting with a letter or a number.
      </Warning>
    );
  }

  if (state.kind === "error") {
    return <Warning>{state.message}</Warning>;
  }

  if (state.kind === "free") {
    return (
      <Hint className="mt-1">
        Free. This {THING[kind]} will live at{" "}
        <span className="text-foreground">
          {prefix}
          {slug}
        </span>
        .
      </Hint>
    );
  }

  const { holder } = state;
  const name = holder.name || `an untitled ${THING[kind]}`;

  // Their live address. Not offered, because taking it would leave that record
  // with nowhere to be — that is a decision to make on its own screen.
  if (holder.held === "current") {
    return (
      <Warning>
        {prefix}
        {slug} is where <span className="font-medium">{name}</span> lives. Give that{" "}
        {THING[kind]} a different address first, or choose another one here.
      </Warning>
    );
  }

  return (
    <div className="mt-1 space-y-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-2.5">
      <p className="text-[11px] leading-relaxed text-destructive">
        {prefix}
        {slug} is an old address of <span className="font-medium">{name}</span> and still
        redirects there. Taking it stops that redirect — anyone on the old link lands here
        instead.
      </p>
      <Button variant="outline" size="sm" onClick={() => onTakeOver(holder)} disabled={busy || disabled}>
        {busy ? "Freeing it…" : `Take it from ${name}`}
      </Button>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-1 text-[11px] leading-relaxed text-destructive">
      {children}
    </p>
  );
}
