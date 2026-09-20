import { Hero } from "@/components/site/Hero";
import { TextMarquee } from "@/components/site/TextMarquee";
import { AboutSection } from "@/components/site/sections/AboutSection";
import { DriversSection } from "@/components/site/sections/DriversSection";
import { CarSpecsSection } from "@/components/site/sections/CarSpecsSection";
import { ScheduleSection } from "@/components/site/sections/ScheduleSection";
import { NewsSection } from "@/components/site/sections/NewsSection";
import { SponsorsSection } from "@/components/site/sections/SponsorsSection";
import { siteCar, siteTeam } from "@/lib/server/siteContent";

export default async function HomePage() {
  // One await for the pair: both reads are memoised for the request, and the
  // bands below do their own — each is a server component of its own.
  const [{ site, hero }, car] = await Promise.all([siteTeam(), siteCar()]);

  return (
    <>
      <Hero site={site} hero={hero} car={car} />
      <TextMarquee
        primary={site.tagline.replace(/\.$/, "")}
        secondary={`Season ${site.currentSeason} · ${site.championship.split(" (")[0]}`}
        className="border-b border-white/10"
      />
      <AboutSection />
      <DriversSection />
      <CarSpecsSection />
      <ScheduleSection />
      <NewsSection />
      <SponsorsSection />
    </>
  );
}
