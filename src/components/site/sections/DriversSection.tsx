import { DriverReel } from "@/components/site/DriverReel";
import { SectionHeading } from "@/components/site/SectionHeading";
import { siteDrivers, siteHistory } from "@/lib/server/siteContent";

export async function DriversSection() {
  const [all, history] = await Promise.all([siteDrivers(), siteHistory()]);

  // Only this season's drivers, in roster order: everyone on a lineup for the
  // newest year that has one (every league the team runs in that year). Not
  // `site.currentSeason` — that is the team's season NUMBER ("Season 4"), not
  // a year. A lineup row counts only when linked to a profile; an unlinked name
  // has no poster. With no lineup filed at all, the full roster stands in.
  const linked = history.filter((s) => s.drivers.some((d) => d.slug));
  const year = Math.max(...linked.map((s) => s.year));
  const current = new Set(
    linked.filter((s) => s.year === year).flatMap((s) => s.drivers.map((d) => d.slug ?? ""))
  );
  const drivers = linked.length > 0 ? all.filter((d) => current.has(d.slug)) : all;

  // Nothing on the roster: the band goes entirely rather than leaving a
  // heading over an empty reel. Same call NewsSection makes.
  if (drivers.length === 0) return null;

  return (
    <section id="drivers" className="relative border-y border-white/10 bg-carbon-900/50 py-24 lg:py-0">
      <DriverReel
        drivers={drivers}
        header={
          <SectionHeading
            index="02"
            label="The Grid"
            title="Our Drivers"
            action={{ href: "/drivers", label: "Full roster" }}
          />
        }
      />
    </section>
  );
}
