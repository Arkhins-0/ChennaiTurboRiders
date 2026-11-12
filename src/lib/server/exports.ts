import "server-only";

import { NextResponse } from "next/server";

/*
 * The file formats behind the console's Exports page: CSV for a spreadsheet
 * and iCalendar for a phone's calendar. Pure string building — the routes
 * under src/app/api/admin/exports/ read the rows and guard the request.
 */

/* ───────────────────────────────── CSV ─────────────────────────────────── */

export type Cell = string | number | null | undefined;

/**
 * One field, RFC 4180: every field quoted, a quote inside doubled. Quoting all
 * of them rather than only the ones that need it costs two bytes a field and
 * removes the one decision that goes wrong (a comma in a sponsor's name).
 *
 * A text that starts like a formula (= + - @, or a tab/CR) gets a leading
 * apostrophe, so a spreadsheet shows it rather than running it. Numbers are
 * written as numbers and never touched.
 */
function field(value: Cell): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number") return Number.isFinite(value) ? `"${value}"` : '""';
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}

/** A whole CSV document: a header row and the rows, CRLF line ends. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}

/** Today in India, for filenames: `2026-11-12`. */
export function stamp(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

function attachment(filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, "-");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * A CSV download. UTF-8 with a byte-order mark: without it Excel opens the
 * file as the system codepage and every accented name comes out mangled.
 * The mark is written as an escape, never as the raw character (see
 * scripts/check-source.mjs).
 */
export function csvResponse(filename: string, csv: string): Response {
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": attachment(filename),
      "Cache-Control": "no-store",
    },
  });
}

/* ─────────────────────────────── iCalendar ─────────────────────────────── */

export type CalendarDay = {
  uid: string;
  /** ISO `YYYY-MM-DD`. */
  from: string;
  /** ISO `YYYY-MM-DD`, inclusive; "" for a one-day event. */
  to: string;
  summary: string;
  location?: string;
  description?: string;
  url?: string;
};

/** RFC 5545 TEXT: backslash, semicolon, comma and newlines escaped. */
function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded: CRLF and a space, counted in bytes, never splitting a character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = out.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

const compact = (iso: string) => iso.replace(/-/g, "");

function dayAfter(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar of all-day events. A race weekend is days, not instants — the
 * same reasoning as src/lib/raceDates.ts — so DTSTART/DTEND are DATE values
 * and the end is exclusive (the day after the last day). Rounds without a
 * date are left out: there is nothing to put in a calendar.
 */
export function toIcs(name: string, days: CalendarDay[], now = new Date()): string {
  const dtstamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chennai Turbo Riders//CTR Console//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(name)}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
  ];

  for (const day of days) {
    if (!ISO_DATE.test(day.from)) continue;
    const last = ISO_DATE.test(day.to) && day.to >= day.from ? day.to : day.from;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${day.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compact(day.from)}`,
      `DTEND;VALUE=DATE:${compact(dayAfter(last))}`,
      `SUMMARY:${text(day.summary)}`,
      "TRANSP:TRANSPARENT"
    );
    if (day.location) lines.push(`LOCATION:${text(day.location)}`);
    if (day.description) lines.push(`DESCRIPTION:${text(day.description)}`);
    if (day.url) lines.push(`URL:${day.url}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function icsResponse(filename: string, ics: string): Response {
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": attachment(filename),
      "Cache-Control": "no-store",
    },
  });
}

/* ─────────────────────────────── Failures ──────────────────────────────── */

/** A table or column a pending migration adds is not there yet. */
export function isMissingRelation(error: unknown): boolean {
  const record = error as { code?: string; message?: string } | null;
  return (
    record?.code === "42P01" ||
    record?.code === "42703" ||
    /does not exist/i.test(record?.message ?? "")
  );
}

export function exportFailed(what: string, error: unknown): NextResponse {
  console.error(`[admin/exports] ${what}`, error);
  return NextResponse.json({ error: `Could not export the ${what}.` }, { status: 500 });
}
