"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  RICH_MAX_IMAGES,
  normaliseRichText,
  type RichDoc,
} from "@/lib/richtext";
import { DOCUMENT_EDGE, toWebp } from "@/lib/client/toWebp";
import { link as safeLink } from "@/lib/normalise";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { Dialog } from "@/admin/ui/Dialog";
import { Input, Label } from "@/admin/ui/Input";
import {
  BoldIcon,
  BulletListIcon,
  FolderIcon,
  HeadingIcon,
  ImagesIcon,
  ItalicIcon,
  LinkIcon,
  NumberListIcon,
  QuoteIcon,
  RuleIcon,
  UnderlineIcon,
  UnlinkIcon,
  UploadIcon,
} from "@/admin/ui/icons";
import { ErrorNote, Hint } from "@/admin/components/Fields";
import { MediaPicker } from "@/admin/components/MediaPicker";
import { useUploadFolder } from "@/admin/components/UploadFolder";

/**
 * Writing, with the formatting an article actually needs.
 *
 * ── Why there is a dependency here at all ─────────────────────────────────
 *
 * This is the project's first UI dependency past framer-motion, and it is one
 * (TipTap, which is ProseMirror) rather than none because the alternative is
 * `contentEditable` — and `contentEditable` is not a text editor, it is a raw
 * browser API whose behaviour differs per engine for every one of: pressing
 * Enter inside a list, pasting from Word, selecting across two blocks, undo after
 * an image insert, and where the caret lands afterwards. Hand-rolling that is not
 * a smaller amount of code than importing it, it is the same amount of code
 * written worse and discovered by writers.
 *
 * ── What it is allowed to produce ─────────────────────────────────────────
 *
 * Exactly the node types in `RichDoc`, which is why `strike`, `code` and
 * `codeBlock` are switched OFF in StarterKit below rather than left on and
 * dropped later. An editor that can make something the storage layer then
 * silently removes is an editor that loses somebody's work between pressing a
 * button and pressing Save.
 *
 * Headings are levels 2 and 3 only: the page prints the article's title as its
 * H1, and a second H1 in the body is a broken document outline, not a style.
 *
 * ── Where an image goes ───────────────────────────────────────────────────
 *
 * Into the article's own folder, which arrives through the `UploadFolder`
 * context exactly as it does for every `ImageField` on every other screen. There
 * are four ways to add one — the button, the library, a drop and a paste — and
 * all four funnel through `addFiles`, so there is one answer to "what happens to
 * a picture" rather than four.
 */

function imageCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image") count += 1;
  });
  return count;
}

export function RichText({
  value,
  onChange,
  disabled,
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  disabled?: boolean;
}) {
  const folder = useUploadFolder();
  const fileRef = useRef<HTMLInputElement>(null);

  const [browsing, setBrowsing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * The initial document goes through the allowlist before the editor sees it.
   *
   * A row written by an older version could hold a node type this editor no
   * longer configures, and ProseMirror throws on a document its schema cannot
   * describe — which would be a blank screen rather than a degraded one. Read
   * through the same rules as a write, like everything else here.
   */
  const initial = useRef<RichDoc>(normaliseRichText(value));

  /*
   * ── Why these two are refs and not plain closures ─────────────────────
   *
   * `useEditor` builds the ProseMirror instance ONCE and keeps the options it was
   * given. Anything referenced from `onUpdate` or `editorProps` is therefore
   * frozen at first render — and at first render `onChange` closes over the
   * article as it was then, and the upload path closes over an `editor` that is
   * still null.
   *
   * Left alone that is not a crash, which is what makes it worth a comment: it is
   * a save that quietly writes stale values for every field except the one being
   * typed in, and a pasted picture that goes nowhere. Both handlers read through a
   * ref so they always run the current one.
   */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const addFilesRef = useRef<(files: File[]) => void>(() => {});

  const editor = useEditor({
    // Required under the app router: rendering during SSR gives the client a tree
    // built from a different ProseMirror state and React discards the whole thing.
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // Not in RichDoc, so not offered. See the note above.
        strike: false,
        code: false,
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        // Both of these only ever produce http(s), which is what `link()` allows,
        // so a typed or pasted address cannot become a mark that gets stripped.
        autolink: true,
        linkOnPaste: true,
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: initial.current,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[18rem] w-full px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none",
          "[&_p]:my-2",
          "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight",
          "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-[15px] [&_h3]:font-semibold",
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5",
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5",
          "[&_li]:my-0.5 [&_li>p]:my-0",
          "[&_blockquote]:my-3 [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-3 [&_blockquote]:text-muted-fg",
          "[&_a]:underline [&_a]:underline-offset-2",
          "[&_hr]:my-5 [&_hr]:border-border",
          "[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:border-border",
          "[&_img.ProseMirror-selectednode]:outline [&_img.ProseMirror-selectednode]:outline-2 [&_img.ProseMirror-selectednode]:outline-ring"
        ),
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const images = files.filter((file) => file.type.startsWith("image/"));
        if (images.length === 0) return false;

        event.preventDefault();
        addFilesRef.current(images);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        // `moved` is a node being dragged WITHIN the document. That is
        // ProseMirror's job, not ours.
        if (moved) return false;

        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        const images = files.filter((file) => file.type.startsWith("image/"));
        if (images.length === 0) return false;

        event.preventDefault();
        addFilesRef.current(images);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(current.getJSON() as RichDoc);
    },
  });

  /*
   * Take an externally-changed document back.
   *
   * The case this exists for is a save: the server normalises what it was sent,
   * and after a rename it also REWRITES every inline image address to the
   * article's new folder. Without this the editor would still be holding the old
   * ones, and the next save would write them back over the rewritten rows and
   * undo the move.
   *
   * Guarded by a comparison because `onUpdate` sends the same document straight
   * back down through `value` on every keystroke, and calling `setContent` on
   * each of those would reset the caret to the top of the article as somebody
   * typed.
   */
  useEffect(() => {
    if (!editor) return;
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(value)) return;
    editor.commands.setContent(value as unknown as JSONContent, false);
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const insert = useCallback(
    (url: string) => {
      editor?.chain().focus().setImage({ src: url }).run();
    },
    [editor]
  );

  /**
   * Every picture that ends up in the text comes through here.
   *
   * Sequential rather than parallel, like the deck uploader: ten at once is ten
   * concurrent multipart bodies through one route, and the order they land in is
   * the order they appear in the article.
   */
  const addFiles = useCallback(
    async (files: File[]) => {
      if (!editor || files.length === 0) return;
      setError(null);

      const room = RICH_MAX_IMAGES - imageCount(editor);
      if (room <= 0) {
        setError(`An article holds ${RICH_MAX_IMAGES} pictures, and this one is full.`);
        return;
      }

      const taking = files.slice(0, room);
      const overflow = files.length - taking.length;

      let failed = 0;
      /** The first thing the server said, which is more useful than a count. */
      let reason = "";

      for (const [index, file] of taking.entries()) {
        setProgress({ done: index, total: taking.length });

        try {
          const webp = await toWebp(file, DOCUMENT_EDGE);
          const form = new FormData();
          form.append("file", webp);
          // The article's own folder, so its pictures move with it when the
          // address or the page changes.
          form.append("folder", folder);

          const response = await fetch("/api/admin/upload", { method: "POST", body: form });
          const data = await response.json().catch(() => ({}));

          if (!response.ok || typeof data.url !== "string") {
            failed += 1;
            if (!reason && typeof data.error === "string") reason = data.error;
            continue;
          }

          insert(data.url as string);
        } catch {
          failed += 1;
        }
      }

      setProgress(null);

      if (failed > 0) {
        const count =
          failed === 1 ? "One picture could not be uploaded." : `${failed} pictures could not be uploaded.`;
        setError(`${count}${reason ? ` ${reason}` : ""}`);
      } else if (overflow > 0) {
        setError(
          `An article holds ${RICH_MAX_IMAGES} pictures, so the last ${overflow} were not added.`
        );
      }
    },
    [editor, folder, insert]
  );

  useEffect(() => {
    addFilesRef.current = (files) => void addFiles(files);
  }, [addFiles]);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    // Cleared immediately, so picking the same files again fires this again.
    event.target.value = "";
    await addFiles(picked);
  }

  if (!editor) {
    return (
      <div className="rounded-md border border-border bg-background">
        <div className="h-10 border-b border-border" />
        <div className="min-h-[18rem] px-3 py-2.5 text-sm text-muted-fg">Loading the editor…</div>
      </div>
    );
  }

  const working = progress !== null;
  const locked = disabled || working;

  return (
    <div className="block">
      <Label>Article</Label>

      <div className="mt-1.5 overflow-hidden rounded-md border border-border bg-background focus-within:border-ring">
        <Toolbar
          editor={editor}
          disabled={locked}
          onUpload={() => fileRef.current?.click()}
          onBrowse={() => setBrowsing(true)}
          onLink={() => setLinking(true)}
        />

        <EditorContent editor={editor} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        className="hidden"
      />

      <Hint className="mt-1">
        {working
          ? `Uploading ${progress.done + 1} of ${progress.total}…`
          : "Pictures can also be dropped or pasted straight into the text where you want them. They are resized before they leave this machine."}
      </Hint>

      {error ? (
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      <MediaPicker
        open={browsing}
        onClose={() => setBrowsing(false)}
        onSelect={insert}
        startFolder={folder}
      />

      <LinkDialog
        open={linking}
        onClose={() => setLinking(false)}
        editor={editor}
      />
    </div>
  );
}

/* ─────────────────────────────── Toolbar ────────────────────────────── */

/**
 * `default` is the only coloured button in this design system, which makes it
 * exactly the right variant for "this mark is on at the caret" — the toolbar
 * reads as a row of toggles without needing a second visual language.
 */
function Toolbar({
  editor,
  disabled,
  onUpload,
  onBrowse,
  onLink,
}: {
  editor: Editor;
  disabled?: boolean;
  onUpload: () => void;
  onBrowse: () => void;
  onLink: () => void;
}) {
  const mark = (active: boolean): "default" | "ghost" => (active ? "default" : "ghost");

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-card/40 px-1.5 py-1">
      <Button
        variant={mark(editor.isActive("bold"))}
        size="icon-sm"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
        aria-label="Bold"
      >
        <BoldIcon />
      </Button>

      <Button
        variant={mark(editor.isActive("italic"))}
        size="icon-sm"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
        aria-label="Italic"
      >
        <ItalicIcon />
      </Button>

      <Button
        variant={mark(editor.isActive("underline"))}
        size="icon-sm"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
        aria-label="Underline"
      >
        <UnderlineIcon />
      </Button>

      <Divider />

      <Button
        variant={mark(editor.isActive("heading", { level: 2 }))}
        size="icon-sm"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading"
        aria-label="Heading"
      >
        <HeadingIcon />
      </Button>

      <Button
        variant={mark(editor.isActive("heading", { level: 3 }))}
        size="icon-sm"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Smaller heading"
        aria-label="Smaller heading"
      >
        <HeadingIcon className="size-3.5" />
      </Button>

      <Button
        variant={mark(editor.isActive("bulletList"))}
        size="icon-sm"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bulleted list"
        aria-label="Bulleted list"
      >
        <BulletListIcon />
      </Button>

      <Button
        variant={mark(editor.isActive("orderedList"))}
        size="icon-sm"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
        aria-label="Numbered list"
      >
        <NumberListIcon />
      </Button>

      <Button
        variant={mark(editor.isActive("blockquote"))}
        size="icon-sm"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Quote"
        aria-label="Quote"
      >
        <QuoteIcon />
      </Button>

      <Divider />

      <Button
        variant={mark(editor.isActive("link"))}
        size="icon-sm"
        disabled={disabled}
        onClick={onLink}
        title="Link"
        aria-label="Link"
      >
        <LinkIcon />
      </Button>

      {editor.isActive("link") ? (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Remove the link"
          aria-label="Remove the link"
        >
          <UnlinkIcon />
        </Button>
      ) : null}

      <Divider />

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={onUpload}
        title="Upload a picture here"
        aria-label="Upload a picture here"
      >
        <UploadIcon />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={onBrowse}
        title="Insert a picture from the library"
        aria-label="Insert a picture from the library"
      >
        <FolderIcon />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Divider"
        aria-label="Divider"
      >
        <RuleIcon />
      </Button>

      <span className="ms-auto hidden items-center gap-1 pe-1 text-[11px] text-muted-fg sm:flex">
        <ImagesIcon className="size-3.5" />
        drop or paste
      </span>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

/* ───────────────────────────── Link dialog ──────────────────────────── */

/**
 * The address of a link, checked before it becomes one.
 *
 * `link()` is the same function the body normaliser uses on the way into the
 * database, so an address refused here is exactly an address that would have been
 * dropped there. Doing it in both places is not duplication — it is the
 * difference between "the editor told me" and "my link silently vanished".
 */
function LinkDialog({
  open,
  onClose,
  editor,
}: {
  open: boolean;
  onClose: () => void;
  editor: Editor;
}) {
  const [href, setHref] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBad(false);
    setHref((editor.getAttributes("link").href as string) ?? "");
  }, [open, editor]);

  function apply() {
    const clean = safeLink(href, "");

    if (!clean) {
      setBad(true);
      return;
    }

    // An empty selection would set a mark on nothing; `extendMarkRange` grows it
    // to the whole existing link so editing one does not need it re-selected.
    editor.chain().focus().extendMarkRange("link").setLink({ href: clean }).run();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Link" className="max-w-md">
      <Label>Address</Label>
      <Input
        value={href}
        autoFocus
        placeholder="https://example.com"
        onChange={(event) => {
          setHref(event.target.value);
          setBad(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          }
        }}
        className="mt-1.5"
      />

      {bad ? (
        <div className="mt-2">
          <ErrorNote>
            That is not an address this site can link to. Use a full https:// address, a path on this
            site starting with /, or an anchor starting with #.
          </ErrorNote>
        </div>
      ) : (
        <Hint className="mt-1.5">
          A full https:// address, a path on this site like /circuits, or an anchor like #entry.
        </Hint>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={apply}>
          Link
        </Button>
      </div>
    </Dialog>
  );
}
