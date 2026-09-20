import type { Metadata } from "next";
import { DriverPoster } from "@/components/site/DriverPoster";
import { PageHeader } from "@/components/site/PageHeader";
import { Reveal } from "@/components/site/Reveal";
import { siteDrivers } from "@/lib/server/siteContent";

export const metadata: Metadata = {
  title: "Drivers",
  description: "Meet the Chennai Turbo Riders driver roster across IRL and F4.",
};

const groups = [
  { key: "IRL", label: "Indian Racing League" },
  { key: "F4", label: "F4 Indian Championship" },
];

export default async function DriversPage() {
  const drivers = await siteDrivers();

  return (
    <>
      <PageHeader
        crumb="Drivers"
        title="The Grid"
        description="Eight drivers. Two championships. One team chasing glory across the Indian motorsport calendar."
        aside={`${drivers.length} drivers`}
      />

      <div className="section-container space-y-24 py-16 md:py-24">
        {groups.map((g, gi) => {
          const list = drivers.filter((d) => d.championship === g.key);
          if (list.length === 0) return null;
          return (
            <section key={g.key} aria-labelledby={`grid-${g.key}`}>
              <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="readout">
                    <span className="text-racing-yellow">{String(gi + 1).padStart(2, "0")}</span>
                    <span className="mx-2 text-carbon-400">/</span>
                    {g.key}
                  </p>
                  <h2
                    id={`grid-${g.key}`}
                    className="heading-font lean mt-2 text-4xl font-bold uppercase leading-none text-white md:text-5xl"
                  >
                    {g.label}
                  </h2>
                </div>
                <span className="readout">{list.length} drivers</span>
              </Reveal>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                {list.map((d, i) => (
                  <Reveal key={d.id} delay={i * 0.06}>
                    <DriverPoster driver={d} index={i} className="aspect-[3/4.4]" eager={gi === 0 && i < 4} />
                  </Reveal>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
