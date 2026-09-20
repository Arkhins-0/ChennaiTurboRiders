export function formatDateRange(startISO: string, endISO?: string) {
  const start = new Date(startISO);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (!endISO || startISO === endISO) {
    return start.toLocaleDateString("en-GB", { ...opts, year: "numeric" });
  }
  const end = new Date(endISO);
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString("en-GB", sameMonth ? { day: "numeric" } : opts);
  const endStr = end.toLocaleDateString("en-GB", { ...opts, year: "numeric" });
  return `${startStr} – ${endStr}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
