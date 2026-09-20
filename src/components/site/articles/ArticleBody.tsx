import type { RichDoc, RichInline, RichListItem, RichNode } from "@/lib/richtext";
import { cn } from "@/lib/utils";
import { Media } from "@/components/ui/Media";

/**
 * An article's body, drawn as real elements.
 *
 * ── Why there is no sanitiser anywhere in this feature ────────────────────
 *
 * Because there is no markup to sanitise. The body is a TREE of typed nodes, and
 * what follows is a `switch` over the set of types `RichNode` names. Every
 * branch builds a React element this file chose; the `default` builds nothing.
 * `dangerouslySetInnerHTML` does not appear here and must never be added — the
 * moment it is, this stops being a renderer and becomes an injection point, and
 * the whole reason the body is stored as JSONB rather than HTML is gone.
 *
 * The two attributes that are still addresses were already run through `image()`
 * and `link()` by `normaliseRichText` on the way into the database, and are
 * run through it AGAIN on the way out by `hydrate`. So a row hand-edited in the
 * database to hold `javascript:` reaches this file as a node with no src at all.
 *
 * ── Rendered by the public page AND the admin preview ─────────────────────
 *
 * Which is why it is an ordinary component and not an async one: it has to render
 * inside the editor's client tree as well as on the server. `DeckPages` is the
 * same arrangement for the same reason — what a writer sees while typing is the
 * page itself, not a mock of it.
 */

/** An address that leaves this site, which is the only kind that gets a target. */
function isExternal(href: string): boolean {
  return !href.startsWith("/") && !href.startsWith("#");
}

function Inlines({ nodes }: { nodes: RichInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === "hardBreak") return <br key={index} />;

        /*
         * Marks are applied outside-in, so the innermost element is the text.
         * A link wraps whatever emphasis is on the same run rather than the other
         * way round, which is what keeps the clickable area whole when only part
         * of a link is bold.
         */
        let content: React.ReactNode = node.text;

        for (const mark of node.marks ?? []) {
          if (mark.type === "bold") content = <strong>{content}</strong>;
          else if (mark.type === "italic") content = <em>{content}</em>;
          else if (mark.type === "underline") content = <u>{content}</u>;
        }

        const linkMark = node.marks?.find((mark) => mark.type === "link");

        if (linkMark && linkMark.type === "link") {
          const external = isExternal(linkMark.attrs.href);
          content = (
            <a
              href={linkMark.attrs.href}
              // `noopener` is what stops the opened page reaching back through
              // `window.opener`. Only ever set alongside a target.
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="underline decoration-line underline-offset-2 transition-colors hover:text-fg"
            >
              {content}
            </a>
          );
        }

        return <span key={index}>{content}</span>;
      })}
    </>
  );
}

function ListItems({ items }: { items: RichListItem[] }) {
  return (
    <>
      {items.map((item, index) => (
        <li key={index} className="body-copy">
          <Blocks nodes={item.content} />
        </li>
      ))}
    </>
  );
}

function Blocks({ nodes }: { nodes: RichNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "paragraph":
            // An empty paragraph is a deliberate gap, so it keeps its height
            // rather than collapsing to nothing.
            return node.content && node.content.length > 0 ? (
              <p key={index} className="body-copy my-4">
                <Inlines nodes={node.content} />
              </p>
            ) : (
              <p key={index} className="my-4 h-4" aria-hidden />
            );

          case "heading": {
            // Level 2 and 3 only. The page prints the title as the H1, so an
            // article's own headings start below it.
            const Tag = node.attrs.level === 3 ? "h3" : "h2";
            return (
              <Tag
                key={index}
                className={cn(
                  "headline scroll-mt-24",
                  node.attrs.level === 3 ? "mt-8 text-lg sm:text-xl" : "mt-10 text-xl sm:text-2xl"
                )}
              >
                <Inlines nodes={node.content ?? []} />
              </Tag>
            );
          }

          case "blockquote":
            return (
              <blockquote
                key={index}
                className="my-6 border-s-2 border-line ps-4 [&_p]:text-[16px] [&_p]:italic"
              >
                <Blocks nodes={node.content} />
              </blockquote>
            );

          case "bulletList":
            return (
              <ul key={index} className="my-4 list-disc space-y-1 ps-5 [&_p]:my-0">
                <ListItems items={node.content} />
              </ul>
            );

          case "orderedList":
            return (
              <ol key={index} className="my-4 list-decimal space-y-1 ps-5 [&_p]:my-0">
                <ListItems items={node.content} />
              </ol>
            );

          case "image":
            return (
              <figure key={index} className="my-6">
                {/*
                  A plain <img>, like the deck pages: nothing stores a width or a
                  height, so there is nothing for next/image to reserve space
                  with. Lazy, because an article's pictures are below the fold by
                  definition — the cover is the one above it and the page draws
                  that itself.
                */}
                <Media
                  src={node.attrs.src}
                  alt={node.attrs.alt}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full rounded-[6px] bg-panel"
                />
                {node.attrs.alt ? (
                  <figcaption className="mt-2 text-center text-[13px] text-fg-muted">
                    {node.attrs.alt}
                  </figcaption>
                ) : null}
              </figure>
            );

          case "horizontalRule":
            return <hr key={index} className="my-10 border-line" />;

          default:
            /*
             * The allowlist's floor. Unreachable through the normaliser, which
             * already dropped anything not named above — this is here so that
             * adding a type to `RichNode` and forgetting to draw it renders
             * nothing rather than crashing the page.
             */
            return null;
        }
      })}
    </>
  );
}

export function ArticleBody({ doc, className }: { doc: RichDoc; className?: string }) {
  if (doc.content.length === 0) return null;

  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)}>
      <Blocks nodes={doc.content} />
    </div>
  );
}
