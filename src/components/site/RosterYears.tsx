import Link from "next/link";

/**
 * The year switcher above the roster: the current grid, then every year the
 * team has a lineup on file, newest first. Plain links, so each year is its
 * own static page and its own shareable address.
 */
export function RosterYears({ years, active }: { years: number[]; active: "current" | number }) {
  const items: { href: string; label: string; key: string; on: boolean }[] = [
    { href: "/drivers", label: "Current", key: "current", on: active === "current" },
    ...years.map((y) => ({ href: `/drivers/season/${y}`, label: String(y), key: String(y), on: active === y })),
  ];

  return (
    <nav aria-label="Roster by year" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ol className="flex w-max gap-px border border-white/10 bg-white/10">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.on ? "page" : undefined}
              className={`heading-font block px-5 py-3 text-lg font-bold uppercase leading-none transition-colors md:px-6 ${
                item.on
                  ? "bg-racing-yellow text-carbon-950"
                  : "bg-carbon-950 text-carbon-300 hover:bg-carbon-900 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
