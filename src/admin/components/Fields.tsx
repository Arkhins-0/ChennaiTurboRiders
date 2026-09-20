"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/admin/ui/Card";
import { Input, Label, Textarea } from "@/admin/ui/Input";

/**
 * The admin's form vocabulary — the shapes every panel is built from.
 *
 * These wrap the primitives in `ui/` with the one arrangement this app uses:
 * label above control, hint below it, everything full width. Panels never reach
 * for `<Input>` directly, so the field metrics are identical on every screen and
 * changing them is one edit here.
 */

/** A titled box holding one group of related fields. */
export function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="shrink-0 text-[13px]">{title}</CardTitle>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Two fields side by side.
 *
 * Keyed off `sm:` — the editor column is about 480px wide, which splits into two
 * readable columns for short fields. Anything holding a URL gets a whole row.
 */
export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2", className)}>{children}</div>;
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="mt-1.5"
      />
      {hint ? <Hint className="mt-1">{hint}</Hint> : null}
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  hint,
  maxLength,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className="mt-1.5"
      />
      {hint ? <Hint className="mt-1">{hint}</Hint> : null}
    </label>
  );
}

/**
 * A button's label and its link, boxed together.
 *
 * Every button on the landing page is this same pair, and the two are useless
 * apart — boxing them stops a label ending up next to the wrong link when a
 * panel has more than one button in it. Blank label means no button, which is
 * what the page components already do, so the placeholder says so.
 */
export function ButtonFields({
  title = "Button",
  hint,
  label,
  href,
  onLabel,
  onHref,
  className,
}: {
  title?: string;
  hint?: string;
  label: string;
  href: string;
  onLabel: (value: string) => void;
  onHref: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border bg-background/60 p-3", className)}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="shrink-0 text-[11px] font-medium text-muted-fg">{title}</span>
        {hint ? <span className="truncate text-[11px] text-muted-fg/70">{hint}</span> : null}
      </div>
      <Row>
        <Field label="Label" value={label} onChange={onLabel} placeholder="Blank hides it" />
        <Field label="Links to" value={href} onChange={onHref} placeholder="#sports" />
      </Row>
    </div>
  );
}

/** A line of explanation inside a panel. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs leading-relaxed text-muted-fg", className)}>{children}</p>;
}

/** The smaller line under a single control. */
export function Hint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("block text-[11px] text-muted-fg/80", className)}>{children}</span>;
}

/** What a failed request says. The only red in a form. */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      {children}
    </p>
  );
}
