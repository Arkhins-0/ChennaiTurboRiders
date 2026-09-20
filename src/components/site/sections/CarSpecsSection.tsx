import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { siteCar } from "@/lib/server/siteContent";

/**
 * The machine, as a telemetry sheet.
 *
 * The photograph pinned on the left while the specification scrolls past on
 * the right: eight readouts, each a mono label, a large value, and a hairline
 * that draws itself in as the row arrives. The two detail shots close the
 * sheet.
 */
export async function CarSpecsSection() {
  const carSpecs = await siteCar();
  const [primary, secondary, tertiary] = [carSpecs.image, carSpecs.image2, carSpecs.image3];

  return (
    <section id="machine" className="relative py-24 md:py-32">
      <div className="section-container">
        <SectionHeading index="03" label={carSpecs.tagline} title={`The ${carSpecs.name}`} />

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Reveal className="hud-corners p-3">
              <div className="relative aspect-[4/3] overflow-hidden bg-carbon-900">
                <img
                  src={primary}
                  alt={carSpecs.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                <div className="grain absolute inset-0 opacity-30" />
                <span className="readout absolute bottom-4 left-4 bg-carbon-950/80 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
                  {carSpecs.year} · {carSpecs.name}
                </span>
              </div>
            </Reveal>
            <Reveal delay={0.1} className="mt-3 grid grid-cols-2 gap-3">
              {[secondary, tertiary].map((src, i) => (
                <div key={src} className="relative aspect-[16/10] overflow-hidden bg-carbon-900">
                  <img
                    src={src}
                    alt={`${carSpecs.name} — detail ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover grayscale transition-[filter] duration-700 hover:grayscale-0"
                  />
                </div>
              ))}
            </Reveal>
          </div>

          <div>
            <Reveal>
              <p className="readout text-racing-yellow">Telemetry</p>
              <p className="mt-4 text-base leading-relaxed text-carbon-300 md:text-lg">{carSpecs.description}</p>
            </Reveal>

            <dl className="mt-10">
              {carSpecs.specs.map((s, i) => (
                <Reveal
                  key={s.label}
                  delay={i * 0.05}
                  className="group grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 border-t border-white/10 py-5 last:border-b"
                >
                  <span className="readout text-[10px]">{String(i + 1).padStart(2, "0")}</span>
                  <dt className="readout">{s.label}</dt>
                  <dd className="heading-font text-3xl font-bold leading-none text-white md:text-4xl">
                    {s.value}
                  </dd>
                  <span
                    aria-hidden
                    className="col-span-3 mt-3 h-px origin-left scale-x-0 bg-racing-yellow transition-transform duration-1000 ease-out group-hover:scale-x-100"
                  />
                </Reveal>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
