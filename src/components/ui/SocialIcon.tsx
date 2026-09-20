/** The four the footer and the navigation draw, plus a generic globe. */
export type SocialIconName = "instagram" | "facebook" | "twitter" | "youtube" | "website";

/**
 * Hand-drawn so the footer costs no icon library. Anything unrecognised falls
 * through to a globe, which reads as "somewhere else on the web".
 */
export function SocialIcon({
  name,
  className = "h-4 w-4",
}: {
  name: SocialIconName;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "instagram":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <path d="M14 21v-7h2.5l.5-3H14V9c0-.9.3-1.5 1.7-1.5H17V4.8c-.3 0-1.2-.1-2.3-.1-2.3 0-3.7 1.4-3.7 4V11H8.5v3H11v7z" />
        </svg>
      );
    case "twitter":
      return (
        <svg {...common}>
          <path d="M20.5 5.5c-.7.4-1.4.6-2.2.7a3.6 3.6 0 0 0 1.6-2 7.3 7.3 0 0 1-2.3.9 3.6 3.6 0 0 0-6.2 3.3A10.2 10.2 0 0 1 4 4.6a3.6 3.6 0 0 0 1.1 4.8c-.6 0-1.2-.2-1.7-.5v.1c0 1.8 1.3 3.2 3 3.6-.5.1-1.1.2-1.6.1a3.6 3.6 0 0 0 3.4 2.5A7.2 7.2 0 0 1 3 16.6a10.2 10.2 0 0 0 5.5 1.6c6.6 0 10.2-5.5 10.2-10.2v-.5c.7-.5 1.3-1.2 1.8-1.9z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="2.5" y="6" width="19" height="12" rx="4" />
          <path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.2 2.3 3.3 5.3 3.3 8.5s-1.1 6.2-3.3 8.5c-2.2-2.3-3.3-5.3-3.3-8.5S9.8 5.8 12 3.5z" />
        </svg>
      );
  }
}
