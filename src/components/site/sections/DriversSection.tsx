import { DriverReel } from "@/components/site/DriverReel";
import { SectionHeading } from "@/components/site/SectionHeading";
import { siteDrivers } from "@/lib/server/siteContent";

export async function DriversSection() {
  const drivers = await siteDrivers();

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
