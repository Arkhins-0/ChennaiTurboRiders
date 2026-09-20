import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes without the later one silently losing to the earlier. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Blank-line-separated copy becomes one paragraph per entry.
 *
 * A textarea in the console is one string; the page wants <p> elements. Here
 * rather than beside one section, because the introduction, the about band and
 * anything else with a body of copy all read it the same way.
 */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
