/**
 * Two rows of enormous words travelling in opposite directions.
 *
 * The top row is solid, the bottom outlined; both are the display face at a
 * size that makes the words a texture rather than a sentence. Each row is
 * rendered twice so the marquee keyframe, which travels half the width, loops
 * without a seam. Reduced motion freezes both in globals.css.
 */
export function TextMarquee({
  primary,
  secondary,
  className = "",
}: {
  primary: string;
  secondary: string;
  className?: string;
}) {
  const row = (text: string, count = 6) => Array.from({ length: count }, () => text);

  return (
    <div aria-hidden className={`relative overflow-hidden py-6 ${className}`}>
      <div className="flex w-max animate-marquee-slow whitespace-nowrap">
        {[...row(primary), ...row(primary)].map((t, i) => (
          <span
            key={i}
            className="heading-font lean px-6 text-[clamp(3rem,9vw,8rem)] font-bold uppercase leading-none text-white"
          >
            {t}
            <span className="ml-12 inline-block size-4 rotate-45 bg-racing-yellow align-middle" />
          </span>
        ))}
      </div>
      <div className="mt-2 flex w-max animate-marquee-reverse whitespace-nowrap">
        {[...row(secondary), ...row(secondary)].map((t, i) => (
          <span
            key={i}
            className="heading-font lean text-stroke-white px-6 text-[clamp(3rem,9vw,8rem)] font-bold uppercase leading-none"
          >
            {t}
            <span className="ml-12 inline-block size-4 rotate-45 border border-white/70 align-middle" />
          </span>
        ))}
      </div>
    </div>
  );
}
