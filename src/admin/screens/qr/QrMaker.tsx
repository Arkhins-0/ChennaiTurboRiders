"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/admin/ui/Card";
import { Input, Label, Select } from "@/admin/ui/Input";
import { DownloadIcon } from "@/admin/ui/icons";
import { toast } from "@/admin/components/Toasts";

/*
 * A QR code maker that lives entirely in the browser: paste a link or pick one
 * of the site's pages, choose a size and two colours, download a PNG or an SVG.
 * Nothing is sent anywhere or kept — the `qrcode` package works the pattern
 * out here and draws it on a canvas.
 */

export type QrPreset = { label: string; url: string; group: string };

type Level = "L" | "M" | "Q" | "H";

const SIZES = [256, 512, 1024, 2048];

/** Ready-made colour pairs; either colour can be changed after. */
const LOOKS: { name: string; dark: string; light: string }[] = [
  { name: "Classic", dark: "#0e0f12", light: "#ffffff" },
  { name: "CTR yellow", dark: "#0a0a0a", light: "#f7d619" },
  { name: "Carbon", dark: "#f7d619", light: "#0a0a0a" },
  { name: "Violet", dark: "#4c3fb8", light: "#ffffff" },
];

const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "L", label: "Low", hint: "Smallest pattern" },
  { id: "M", label: "Medium", hint: "The usual choice" },
  { id: "Q", label: "High", hint: "Survives some wear" },
  { id: "H", label: "Highest", hint: "For a sticker over part of it" },
];

/** Relative brightness of a #rrggbb colour, 0–1. */
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  if (value.length < 6) return 1;
  const [r, g, b] = [0, 2, 4].map((at) => {
    const c = parseInt(value.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Colour({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className={cn("block", disabled && "opacity-50")}>
      <Label>{label}</Label>
      <span className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-input bg-card p-0.5 shadow-sm disabled:cursor-not-allowed"
        />
        <span className="font-mono text-xs text-faint">{value}</span>
      </span>
    </label>
  );
}

export function QrMaker({ presets, base }: { presets: QrPreset[]; base: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState(presets[0]?.url ?? "");
  const [dark, setDark] = useState(LOOKS[0].dark);
  const [light, setLight] = useState(LOOKS[0].light);
  const [transparent, setTransparent] = useState(false);
  const [px, setPx] = useState(1024);
  const [margin, setMargin] = useState(2);
  const [level, setLevel] = useState<Level>("M");
  const [problem, setProblem] = useState<string | null>(null);

  const content = text.trim();
  const background = transparent ? "#00000000" : light;

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    if (!content) {
      setProblem("Paste a link, or pick a page, to make its code.");
      return;
    }
    let cancelled = false;
    QRCode.toCanvas(target, content, {
      width: px,
      margin,
      errorCorrectionLevel: level,
      color: { dark, light: background },
    })
      .then(() => {
        // toCanvas sizes the element to the full pixel size inline; the
        // preview fits its card instead, and the download keeps every pixel.
        target.style.width = "100%";
        target.style.height = "auto";
        if (!cancelled) setProblem(null);
      })
      .catch(() => {
        if (!cancelled) setProblem("That is too long for one QR code. Use a shorter link.");
      });
    return () => {
      cancelled = true;
    };
  }, [content, px, margin, level, dark, background]);

  const fileBase = useMemo(() => {
    try {
      const url = new URL(content);
      const stem = `${url.hostname}${url.pathname}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60);
      return `qr-${stem || "code"}`;
    } catch {
      const stem = content.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
      return `qr-${stem || "code"}`;
    }
  }, [content]);

  function downloadPng() {
    if (!canvas.current || problem) return;
    canvas.current.toBlob((blob) => {
      if (!blob) {
        toast({ text: "The picture couldn't be made. Try again.", tone: "error" });
        return;
      }
      save(blob, `${fileBase}.png`);
    }, "image/png");
  }

  async function downloadSvg() {
    if (problem) return;
    try {
      const svg = await QRCode.toString(content, {
        type: "svg",
        width: px,
        margin,
        errorCorrectionLevel: level,
        color: { dark, light: background },
      });
      save(new Blob([svg], { type: "image/svg+xml" }), `${fileBase}.svg`);
    } catch {
      toast({ text: "The SVG couldn't be made. Try again.", tone: "error" });
    }
  }

  const notWeb = content !== "" && !/^https?:\/\//i.test(content);
  const lowContrast = !transparent && Math.abs(luminance(dark) - luminance(light)) < 0.4;
  const inverted = !transparent && luminance(dark) > luminance(light);
  const groups = Array.from(new Set(presets.map((preset) => preset.group)));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block">
              <Label>Link or text</Label>
              <Input value={text} placeholder="https://…" onChange={(event) => setText(event.target.value)} className="mt-1.5" />
              <span className="mt-1 block text-xs text-faint">
                {notWeb
                  ? base
                    ? "Not a web address: the code will hold this text as it is."
                    : "Not a full web address. SITE_URL isn't set on this deployment, so the site's pages are listed as paths."
                  : "Nothing is saved: the code is made in this browser."}
              </span>
            </label>

            {presets.length > 0 ? (
              <label className="block">
                <Label>Or pick a page of the site</Label>
                <Select
                  className="mt-1.5"
                  value={presets.some((preset) => preset.url === content) ? content : ""}
                  onChange={(event) => {
                    if (event.target.value) setText(event.target.value);
                  }}
                >
                  <option value="">Choose a page…</option>
                  {groups.map((group) => (
                    <optgroup key={group} label={group}>
                      {presets
                        .filter((preset) => preset.group === group)
                        .map((preset) => (
                          <option key={preset.url} value={preset.url}>
                            {preset.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </label>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Colours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {LOOKS.map((look) => {
                const on = !transparent && look.dark === dark && look.light === light;
                return (
                  <button
                    key={look.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setDark(look.dark);
                      setLight(look.light);
                      setTransparent(false);
                    }}
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[13px] font-medium shadow-sm transition-colors",
                      on ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-high"
                    )}
                  >
                    <span aria-hidden className="flex overflow-hidden rounded border border-border">
                      <span className="size-3.5" style={{ backgroundColor: look.dark }} />
                      <span className="size-3.5" style={{ backgroundColor: look.light }} />
                    </span>
                    {look.name}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-end gap-6">
              <Colour label="Dots" value={dark} onChange={setDark} />
              <Colour label="Background" value={light} onChange={setLight} disabled={transparent} />
              <label className="flex h-9 items-center gap-2 text-[13px] font-medium text-muted-fg">
                <input
                  type="checkbox"
                  checked={transparent}
                  onChange={(event) => setTransparent(event.target.checked)}
                  className="size-4 accent-[rgb(var(--c-primary))]"
                />
                Clear background
              </label>
            </div>

            {lowContrast ? (
              <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs text-warn-fg">
                The two colours are close: some phones won&apos;t read it. Keep the dots much darker than the background.
              </p>
            ) : inverted ? (
              <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs text-warn-fg">
                Light dots on a dark background: most phones read it, a few older scanners don&apos;t. Test before printing.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Error correction</CardTitle>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Error correction" className="grid gap-2 sm:grid-cols-4">
              {LEVELS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={level === entry.id}
                  onClick={() => setLevel(entry.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left shadow-sm transition-colors",
                    level === entry.id ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:bg-high"
                  )}
                >
                  <span className={cn("block text-[13px] font-medium", level === entry.id ? "text-primary" : "text-foreground")}>
                    {entry.label}
                  </span>
                  <span className="block text-xs text-faint">{entry.hint}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-0 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="grid place-items-center overflow-hidden rounded-xl border border-border"
              style={
                transparent
                  ? { backgroundImage: "repeating-conic-gradient(#d4d6db 0% 25%, #ffffff 0% 50%)", backgroundSize: "20px 20px" }
                  : undefined
              }
            >
              <canvas
                ref={canvas}
                className={cn("aspect-square h-auto w-full", problem && "opacity-20")}
                aria-label="QR code preview"
              />
            </div>
            {problem ? (
              <p className="text-[13px] text-destructive">{problem}</p>
            ) : (
              <p className="text-xs text-faint">Test it with a phone before printing.</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <Label>Size</Label>
                <Select className="mt-1.5" value={String(px)} onChange={(event) => setPx(Number(event.target.value))}>
                  {SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} × {size} px
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <Label>Border</Label>
                <Select className="mt-1.5" value={String(margin)} onChange={(event) => setMargin(Number(event.target.value))}>
                  <option value="0">None</option>
                  <option value="1">Thin</option>
                  <option value="2">Normal</option>
                  <option value="4">Wide</option>
                </Select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button size="md" disabled={Boolean(problem)} onClick={downloadPng}>
                <DownloadIcon /> PNG
              </Button>
              <Button variant="outline" size="md" disabled={Boolean(problem)} onClick={downloadSvg}>
                <DownloadIcon /> SVG
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
