"use client";

import { folderSegments } from "@/lib/mediaPaths";
import { Button } from "@/admin/ui/Button";

/**
 * Where you are, and the way back up.
 *
 * There is no separate Back button, and that is deliberate: the parent segment
 * of the breadcrumb IS the way up, and it is a more useful one because it can
 * skip two levels at once. A second control that does a subset of what this does
 * is a second thing to explain.
 *
 * The last segment is plain text rather than a button. A control that navigates
 * to where you already are reads as broken the first time somebody presses it.
 */
export function Breadcrumb({
  folder,
  onOpen,
}: {
  folder: string;
  onOpen: (folder: string) => void;
}) {
  const segments = folderSegments(folder);

  return (
    <nav aria-label="Folder" className="flex min-w-0 flex-wrap items-center gap-0.5 text-xs">
      {segments.length === 0 ? (
        <span className="px-1 font-medium text-foreground">Media</span>
      ) : (
        <Button variant="link" size="xs" onClick={() => onOpen("")}>
          Media
        </Button>
      )}

      {segments.map((segment, index) => {
        const path = segments.slice(0, index + 1).join("/");
        const last = index === segments.length - 1;

        return (
          <span key={path} className="flex min-w-0 items-center gap-0.5">
            <span aria-hidden className="text-muted-fg">
              /
            </span>

            {last ? (
              <span className="truncate px-1 font-medium text-foreground">{segment}</span>
            ) : (
              <Button variant="link" size="xs" onClick={() => onOpen(path)}>
                {segment}
              </Button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
