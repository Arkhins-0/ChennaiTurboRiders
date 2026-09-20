"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/admin/ui/Badge";
import { Button } from "@/admin/ui/Button";
import { Dialog } from "@/admin/ui/Dialog";
import { CaretDownIcon, DragIcon, PencilIcon, PlusIcon, TrashIcon } from "@/admin/ui/icons";
import { Note, Panel } from "@/admin/components/Fields";
import { Media } from "@/components/ui/Media";

/**
 * A list of the same thing, edited: add, reorder, remove.
 *
 * Nearly every panel in this admin is one of these — stats, vision cards,
 * venues, rounds, photographs, bulletin rows, posts. Writing the add/move/remove
 * plumbing per panel is where those screens drift apart, so it is written once
 * here and each panel supplies only its fields.
 *
 * Three shapes. Without `summary`, every entry is open, one after another —
 * right for short lists of small fields (four figures, six cards) where seeing
 * them all at once is the whole point. With `summary`, each entry is one line,
 * and `expand` decides what opening one does:
 *
 *   "dialog"    (the default) — the entry opens in a window. Right for big
 *               entries: with the fields in a column about a third of the screen
 *               wide, a post with a photograph, a date and two paragraphs has
 *               nowhere to unfold. The window gives it the room and leaves the
 *               list readable underneath.
 *   "accordion" — the entry opens in place, under its own strip. Right for small
 *               ones, where a window is more ceremony than the two fields inside
 *               it are worth.
 *
 * Reordering is the drag handle, and the arrow KEYS on it — which is what
 * carries the keyboard, and the reason the handle is a button at all.
 *
 * The always-open shape puts arrow BUTTONS on each row as well, because there
 * the rows are tall and a drag across four of them is a long way. The two
 * collapsed shapes do not: their rows are one line, so the drag is short, and a
 * pair of buttons on every row of a list of ten is more chrome than list. That
 * does cost touch reordering on those two, since HTML5 drag never fires on a
 * touch screen.
 */

export type RepeaterProps<T> = {
  title: string;
  /** The label on the add button — "Add venue", not "Add". */
  addLabel: string;
  items: T[];
  max: number;
  onChange: (next: T[]) => void;
  /** Builds a new, empty entry. */
  blank: () => T;
  /** Stable React key. Falls back to the index for lists that carry no id. */
  keyOf?: (item: T, index: number) => string;
  /** Reduces each entry to one line. Omit to keep every entry open inline. */
  summary?: (item: T, index: number) => { title: string; hint?: string; image?: string };
  /**
   * How `summary().image` fills its thumbnail.
   *
   * `cover` is right for a photograph, where filling the box matters more than
   * the edges. `contain` is for a picture whose whole shape is the point — a
   * wordmark cropped to a 36×56 box is a letter and a half, which identifies
   * nothing. Those come with a white backing for the same reason the site gives
   * them one: most are dark ink and go invisible on the panel colour.
   */
  imageFit?: "cover" | "contain";
  /** What opening a one-line entry does. Ignored when there is no `summary`. */
  expand?: "dialog" | "accordion";
  /** What the list says when it is empty. */
  empty?: string;
  /** A line of explanation under the list. */
  note?: React.ReactNode;
  /** The fields for one entry. `patch` merges into it. */
  children: (item: T, index: number, patch: (patch: Partial<T>) => void) => React.ReactNode;
};

export function Repeater<T>({
  title,
  addLabel,
  items,
  max,
  onChange,
  blank,
  keyOf,
  summary,
  imageFit = "cover",
  expand = "dialog",
  empty,
  note,
  children,
}: RepeaterProps<T>) {
  const collapsible = Boolean(summary);
  /** One-line entries that open in place instead of in a window. */
  const accordion = collapsible && expand === "accordion";
  /** With `summary`, the index that is open — in a dialog or under its strip. */
  const [open, setOpen] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  function patchAt(index: number, patch: Partial<T>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  /** Moves an entry, and carries the open row and the drag with it. */
  function moveTo(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;

    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);

    if (open === from) setOpen(to);
    if (dragging === from) setDragging(to);
  }

  function add() {
    onChange([...items, blank()]);
    if (collapsible) setOpen(items.length);
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
    // The row below slides up into this slot, so the open row is the same index
    // unless it was the last one.
    if (open !== null && open >= index) setOpen(open > index ? open - 1 : null);
  }

  /** The entry whose DIALOG is open. Never set in the accordion shape, which
      opens the same entry in place instead. */
  const editing = collapsible && !accordion && open !== null && open < items.length ? open : null;
  const editingHead = editing !== null ? summary?.(items[editing], editing) : undefined;

  return (
    <Panel title={title} hint={`${items.length} of ${max}`}>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-input px-4 py-8 text-center text-xs text-muted-fg">
          {empty ?? "Nothing here yet."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, index) => {
            const head = summary?.(item, index);

            return (
              <li
                key={keyOf?.(item, index) ?? index}
                draggable={dragging === index}
                onDragEnter={() => (dragging === null ? undefined : moveTo(dragging, index))}
                onDragOver={(event) => event.preventDefault()}
                onDragEnd={() => setDragging(null)}
                className={cn(
                  "rounded-md border bg-background/60 transition-colors",
                  dragging === index ? "border-primary/60 opacity-40" : "border-border",
                  collapsible && "hover:border-input hover:bg-background"
                )}
              >
                <div className="flex items-center gap-2 p-1.5">
                  <button
                    type="button"
                    aria-label={`Reorder ${index + 1}. Use the arrow keys.`}
                    onPointerDown={() => setDragging(index)}
                    onPointerUp={() => setDragging(null)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveTo(index, index - 1);
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveTo(index, index + 1);
                      }
                    }}
                    className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-fg/60 transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                  >
                    <DragIcon className="size-4" />
                  </button>

                  {head?.image ? (
                    <span
                      className={cn(
                        "h-9 w-14 shrink-0 overflow-hidden rounded border border-border",
                        imageFit === "contain" ? "bg-white p-1" : "bg-background"
                      )}
                    >
                      <Media
                        src={head.image}
                        alt=""
                        className={cn(
                          "h-full w-full",
                          imageFit === "contain" ? "object-contain" : "object-cover"
                        )}
                      />
                    </span>
                  ) : null}

                  {head ? (
                    <button
                      type="button"
                      onClick={() => setOpen(accordion && open === index ? null : index)}
                      aria-expanded={accordion ? open === index : undefined}
                      title={accordion ? undefined : "Edit"}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {head.title || `Item ${index + 1}`}
                      </span>
                      {head.hint ? (
                        <span className="block truncate text-[11px] text-muted-fg">{head.hint}</span>
                      ) : null}
                    </button>
                  ) : (
                    <Badge variant="outline" className="mr-auto">
                      {index + 1} of {items.length}
                    </Badge>
                  )}

                  {accordion ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setOpen(open === index ? null : index)}
                        aria-expanded={open === index}
                        aria-label={open === index ? "Close" : "Edit"}
                      >
                        <CaretDownIcon
                          className={cn("transition-transform", open === index && "rotate-180")}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(index)}
                        aria-label="Remove"
                        className="hover:text-destructive"
                      >
                        <TrashIcon />
                      </Button>
                    </>
                  ) : collapsible ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setOpen(index)}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(index)}
                        aria-label="Remove"
                        className="hover:text-destructive"
                      >
                        <TrashIcon />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveTo(index, index - 1)}
                        disabled={index === 0}
                        aria-label="Move up"
                      >
                        <CaretDownIcon className="rotate-180" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveTo(index, index + 1)}
                        disabled={index === items.length - 1}
                        aria-label="Move down"
                      >
                        <CaretDownIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(index)}
                        aria-label="Remove"
                        className="hover:text-destructive"
                      >
                        <TrashIcon />
                      </Button>
                    </>
                  )}
                </div>

                {/* Always open in the plain shape; open on demand in the
                    accordion; never here in the dialog shape, which mounts its
                    fields in the window at the foot of this file instead. */}
                {!collapsible || (accordion && open === index) ? (
                  <div className="space-y-3 border-t border-dashed border-border p-3">
                    {children(item, index, (patch) => patchAt(index, patch))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={add}
        disabled={items.length >= max}
        className="mt-3"
      >
        <PlusIcon />
        {addLabel}
      </Button>

      {note ? <Note className="mt-3">{note}</Note> : null}

      {/*
        One dialog for the whole list, not one per row: only the open entry is
        mounted, so a list of twenty posts costs one form, not twenty. Edits go
        straight through `patchAt` as they are typed — there is no draft and no
        Cancel, because the page behind is already showing the change and the
        editor's own Save is what decides whether any of it is kept.
      */}
      {editing !== null ? (
        <Dialog
          open
          onClose={() => setOpen(null)}
          title={editingHead?.title || `${title} ${editing + 1}`}
          description={editingHead?.hint}
          className="max-w-2xl"
        >
          <div className="space-y-3">
            {children(items[editing], editing, (patch) => patchAt(editing, patch))}
          </div>

          <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => moveTo(editing, editing - 1)}
              disabled={editing === 0}
              aria-label="Move up"
            >
              <CaretDownIcon className="rotate-180" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => moveTo(editing, editing + 1)}
              disabled={editing === items.length - 1}
              aria-label="Move down"
            >
              <CaretDownIcon />
            </Button>
            <Badge variant="outline">
              {editing + 1} of {items.length}
            </Badge>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => remove(editing)}
              className="ml-auto"
            >
              <TrashIcon />
              Remove
            </Button>
            <Button size="sm" onClick={() => setOpen(null)}>
              Done
            </Button>
          </div>
        </Dialog>
      ) : null}
    </Panel>
  );
}
