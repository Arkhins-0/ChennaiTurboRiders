"use client";

import { useState } from "react";
import { Button, type ButtonVariant } from "@/admin/ui/Button";
import { DownloadIcon } from "@/admin/ui/icons";
import { toast } from "@/admin/components/Toasts";

/** The name the server gave the file, from Content-Disposition. */
function filenameOf(response: Response, fallback: string): string {
  const header = response.headers.get("Content-Disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Fall through to the plain name.
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
}

/**
 * Downloads one export. Fetched rather than linked, so a refusal or a failure
 * — the history before its migration has run, a calendar with no season —
 * comes back as a message in the console instead of a page of JSON.
 */
export function ExportButton({
  href,
  label,
  fallbackName,
  variant = "outline",
}: {
  href: string;
  label: string;
  fallbackName: string;
  variant?: ButtonVariant;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast({ text: data.error ?? "The export failed. Try again.", tone: "error" });
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameOf(response, fallbackName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast({ text: "Network error. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size="sm" onClick={download} disabled={busy}>
      <DownloadIcon />
      {busy ? "Preparing…" : label}
    </Button>
  );
}
