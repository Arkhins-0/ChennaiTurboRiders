/**
 * Every icon the admin uses, in one file.
 *
 * Hand-drawn on a 20px grid in the manner of Phosphor's regular weight — one
 * stroke width, round caps, no fills. Inline rather than a dependency: there are
 * about twenty of them, and an icon package would ship a thousand.
 *
 * They take their size from the button or text around them (`size-4` by
 * default, set by the Button component) and their colour from `currentColor`,
 * so an icon never needs a class of its own.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/* ── Sections ── */

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.5 3.6 5.2v4.5c0 3.4 2.6 6.4 6.4 7.6 3.8-1.2 6.4-4.2 6.4-7.6V5.2Z" />
    <path d="m7.7 10 1.7 1.7 3.3-3.4" />
  </Icon>
);

export const MonitorIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.6" y="4" width="14.8" height="9.8" rx="1.6" />
    <path d="M7 17h6M10 13.8V17" />
  </Icon>
);

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.6 6h12.8M3.6 10h12.8M3.6 14h8" />
  </Icon>
);

export const ImagesIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.4" y="5.2" width="12" height="9.6" rx="1.6" />
    <path d="m2.4 12 2.9-2.6 2.7 2.4 2.2-1.9 4.2 3.6" />
    <path d="M6.6 3h9a2 2 0 0 1 2 2v7.4" />
  </Icon>
);

export const TextIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.6 4.6h12.8M3.6 8h12.8M3.6 11.4h9M3.6 14.8h6" />
  </Icon>
);

export const TrophyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.2 3.2h7.6v3.6a3.8 3.8 0 0 1-7.6 0Z" />
    <path d="M6.2 4.3H3.7v1.4a2.5 2.5 0 0 0 2.5 2.5M13.8 4.3h2.5v1.4a2.5 2.5 0 0 1-2.5 2.5" />
    <path d="M10 10.6v2.7M7 17h6l-.7-3.1H7.7Z" />
  </Icon>
);

export const BoltIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.8 2.5 4.6 11h4.1l-.5 6.4 6.8-8.5h-4.1Z" />
  </Icon>
);

export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M2.9 10h14.2M10 2.9c1.9 2 2.9 4.4 2.9 7.1s-1 5.1-2.9 7.1c-1.9-2-2.9-4.4-2.9-7.1s1-5.1 2.9-7.1Z" />
  </Icon>
);

/* ── Sections: /incrc ── */

export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.6 17.4V3.2M4.6 3.8h9.7l-1.7 3 1.7 3H4.6" />
  </Icon>
);

export const MegaphoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.2v3.6a1.4 1.4 0 0 0 1.4 1.4h1.9l7.5 3.6V3.2L6.3 6.8H4.4A1.4 1.4 0 0 0 3 8.2Z" />
    <path d="M16.3 7.4a3.2 3.2 0 0 1 0 5.2M6.3 13.2v3.4" />
  </Icon>
);

export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.2 16.8h13.6M5.8 16.8V9.4M9.4 16.8V4.6M13 16.8v-5.2M16.6 16.8V7" />
  </Icon>
);

export const StarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m10 2.6 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8Z" />
  </Icon>
);

export const LayersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m10 2.8 7 3.6-7 3.6-7-3.6Z" />
    <path d="m3 10.4 7 3.6 7-3.6M3 14.2l7 3.6 7-3.6" />
  </Icon>
);

export const MapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.4 4 3 5.8v10l4.4-1.8 5.2 2.2L17 14.4v-10l-4.4 1.8Z" />
    <path d="M7.4 4v10.2M12.6 5.8V16" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.4" width="14" height="12.6" rx="1.6" />
    <path d="M3 8.4h14M6.8 2.8v3M13.2 2.8v3" />
  </Icon>
);

export const HandshakeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m2.8 8.6 3-3h3.4l1.4 1.4a1.2 1.2 0 0 1 0 1.7 1.2 1.2 0 0 1-1.7 0L7.8 7.6" />
    <path d="m10.2 6.6 1.6-1h2.4l3 3v3.2l-2.6 2.6-2.4-2.2M8 11l1.8 1.8M6.2 12.4 8 14.2" />
  </Icon>
);

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="7.4" r="2.8" />
    <path d="M2.8 16.4a5.4 5.4 0 0 1 10.4 0" />
    <path d="M13.4 5a2.8 2.8 0 0 1 0 5.4M14.2 11.6a5.4 5.4 0 0 1 3 4.8" />
  </Icon>
);

export const RowsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.8" y="4" width="14.4" height="4" rx="1.2" />
    <rect x="2.8" y="12" width="14.4" height="4" rx="1.2" />
  </Icon>
);

export const NewsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.8" y="4.4" width="14.4" height="11.2" rx="1.6" />
    <path d="M5.6 7.4h4.2v3.4H5.6ZM12.2 7.4h2.6M12.2 10.2h2.6M5.6 13h9.2" />
  </Icon>
);

/* ── Actions ── */

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.2v11.6M4.2 10h11.6" />
  </Icon>
);

export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 10.5 3.6 3.6L15.5 6.7" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.6 5.4h12.8M8.1 5.4V3.8h3.8v1.6M4.9 5.4l.8 10a1.4 1.4 0 0 0 1.4 1.3h5.8a1.4 1.4 0 0 0 1.4-1.3l.8-10" />
    <path d="M8.4 8.4v5.2M11.6 8.4v5.2" />
  </Icon>
);

export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 12.8V3.6M6.6 7 10 3.6 13.4 7" />
    <path d="M3.6 12.4v2.6a1.4 1.4 0 0 0 1.4 1.4h10a1.4 1.4 0 0 0 1.4-1.4v-2.6" />
  </Icon>
);

export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.8 6a1.4 1.4 0 0 1 1.4-1.4h3l1.8 2h6.8A1.4 1.4 0 0 1 17.2 8v6.6a1.4 1.4 0 0 1-1.4 1.4H4.2a1.4 1.4 0 0 1-1.4-1.4Z" />
  </Icon>
);

/* ── The media library ── */

export const FolderPlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.8 6a1.4 1.4 0 0 1 1.4-1.4h3l1.8 2h6.8A1.4 1.4 0 0 1 17.2 8v6.6a1.4 1.4 0 0 1-1.4 1.4H4.2a1.4 1.4 0 0 1-1.4-1.4Z" />
    <path d="M10 9.6v3.8M8.1 11.5h3.8" />
  </Icon>
);

/**
 * A sheet with its corner turned. Deliberately plain: the media grid writes the
 * uppercase extension underneath it, so one icon covers PDF, XLSX and the rest
 * — and "PDF" says more to a reader than any bespoke glyph for it would.
 */
export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.4 2.8H5.8a1.4 1.4 0 0 0-1.4 1.4v11.6a1.4 1.4 0 0 0 1.4 1.4h8.4a1.4 1.4 0 0 0 1.4-1.4V6.8Z" />
    <path d="M11.4 2.8v4h4.2" />
  </Icon>
);

export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="5.6" height="5.6" rx="1.2" />
    <rect x="11.4" y="3" width="5.6" height="5.6" rx="1.2" />
    <rect x="3" y="11.4" width="5.6" height="5.6" rx="1.2" />
    <rect x="11.4" y="11.4" width="5.6" height="5.6" rx="1.2" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7.2" y="7.2" width="9.6" height="9.6" rx="1.6" />
    <path d="M12.8 4.6a1.4 1.4 0 0 0-1.4-1.4H4.6a1.4 1.4 0 0 0-1.4 1.4v6.8a1.4 1.4 0 0 0 1.4 1.4" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5.4" />
    <path d="m13 13 3.6 3.6" />
  </Icon>
);

export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.9 10S5 4.8 10 4.8 18.1 10 18.1 10 15 15.2 10 15.2 1.9 10 1.9 10Z" />
    <circle cx="10" cy="10" r="2.4" />
  </Icon>
);

export const EyeSlashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.4 5.6C2.8 7 1.9 10 1.9 10s3.1 5.2 8.1 5.2c1.5 0 2.8-.5 3.9-1.1M16 12.4c1.4-1.3 2.1-2.4 2.1-2.4S15 4.8 10 4.8c-.6 0-1.2.1-1.7.2" />
    <path d="m3.4 3.4 13.2 13.2" />
  </Icon>
);

export const SignOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 6.2V4.4A1.4 1.4 0 0 0 11.6 3H4.9a1.4 1.4 0 0 0-1.4 1.4v11.2A1.4 1.4 0 0 0 4.9 17h6.7a1.4 1.4 0 0 0 1.4-1.4v-1.8" />
    <path d="M8.6 10h8.2M14.2 7.4 16.8 10l-2.6 2.6" />
  </Icon>
);

export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.4 3.4h5.2v5.2M16.6 3.4 9.4 10.6" />
    <path d="M14.4 11.6v4a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 15.6V7a1.4 1.4 0 0 1 1.4-1.4h4" />
  </Icon>
);

/* ── Movement ── */

export const CaretDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 7.5 5 5 5-5" />
  </Icon>
);

/** The drag handle. Filled, not stroked — six dots read better solid. */
export const DragIcon = (p: IconProps) => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...p}>
    <circle cx="7.5" cy="5" r="1.4" />
    <circle cx="12.5" cy="5" r="1.4" />
    <circle cx="7.5" cy="10" r="1.4" />
    <circle cx="12.5" cy="10" r="1.4" />
    <circle cx="7.5" cy="15" r="1.4" />
    <circle cx="12.5" cy="15" r="1.4" />
  </svg>
);

/* ── Panels ── */

/**
 * A pane beside a body of content. One glyph, mirrored by the caller with
 * `scale-x-[-1]` for the right-hand pane, so the two toggles are the same shape.
 */
export const PanelIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
    <path d="M8 3.5v13" />
  </Icon>
);

/** Opens a row's fields in a dialog. */
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.2 3.3a1.7 1.7 0 0 1 2.4 2.4L7 14.3l-3.2.9.9-3.2 8.5-8.7Z" />
  </Icon>
);

/* ── Writing ── */

/*
 * The article editor's toolbar.
 *
 * These are the only glyphs in this file that stand for a LETTERFORM rather than
 * an object, which is why the three below are drawn as filled text rather than
 * strokes: a 1.5px outline of the letter B at 16px is a smudge. They set
 * `fill="currentColor"` and `stroke="none"` on the path, overriding the shared
 * Icon defaults for themselves alone.
 */

export const BoldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      fill="currentColor"
      stroke="none"
      d="M5.8 3.6h4.6a3.4 3.4 0 0 1 2.4 5.8 3.6 3.6 0 0 1-1.8 6.6H5.8Zm2.3 2v3.2h2.3a1.6 1.6 0 0 0 0-3.2Zm0 5.2V14h2.9a1.6 1.6 0 0 0 0-3.2Z"
    />
  </Icon>
);

export const ItalicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.4 3.9H8.2M11.8 16.1H7.6M11 3.9 9 16.1" />
  </Icon>
);

export const UnderlineIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.6 3.4v5.9a4.4 4.4 0 0 0 8.8 0V3.4M4.6 16.6h10.8" />
  </Icon>
);

/** A heading. The bar under it is what separates it from the bold A. */
export const HeadingIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.6 4v9M11.6 4v9M4.6 8.5h7M4.6 16.4h10.8" />
  </Icon>
);

export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.4 11.6a2.9 2.9 0 0 0 4.3.3l2.3-2.3a2.9 2.9 0 0 0-4.1-4.1l-1.3 1.3" />
    <path d="M11.6 8.4a2.9 2.9 0 0 0-4.3-.3L5 10.4a2.9 2.9 0 0 0 4.1 4.1l1.3-1.3" />
  </Icon>
);

/** Removes a link without removing the words it was on. */
export const UnlinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.3 6.6 10.6 5.3a2.9 2.9 0 0 1 4.1 4.1l-1.3 1.3" />
    <path d="M10.7 13.4 9.4 14.7a2.9 2.9 0 0 1-4.1-4.1l1.3-1.3" />
    <path d="M3.2 3.2l13.6 13.6" />
  </Icon>
);

export const QuoteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4.4v11.2" />
    <path d="M8 6.6h8.4M8 10h8.4M8 13.4h5.4" />
  </Icon>
);

export const BulletListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.4 5.4h9M7.4 10h9M7.4 14.6h9" />
    <circle cx="4.2" cy="5.4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="4.2" cy="10" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="4.2" cy="14.6" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
);

export const NumberListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.8 5.4h8.6M7.8 10h8.6M7.8 14.6h8.6" />
    <path d="M3.2 4.6l1.1-.6v2.9M3.1 8.9a1.1 1.1 0 0 1 1.9.8c0 .8-1.9 1.5-1.9 2.2h2M3.2 13.5h1.8l-1 1.2a1 1 0 1 1-.8 1.5" />
  </Icon>
);

/** A rule across the article. */
export const RuleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.2 10h13.6" />
    <path d="M5.6 5.6h8.8M5.6 14.4h8.8" opacity="0.4" />
  </Icon>
);
