import { requireAnySite } from "@/lib/server/access";
import { getRootSite } from "@/lib/server/sitesRepo";
import { listDrivers } from "@/lib/server/driversRepo";
import { ConsolePage, PageStrip } from "@/admin/components/PageStrip";
import { QrMaker, type QrPreset } from "@/admin/screens/qr/QrMaker";

export const dynamic = "force-dynamic";

export const metadata = { title: "QR codes" };

const PAGES: { label: string; path: string }[] = [
  { label: "Home", path: "/" },
  { label: "Drivers", path: "/drivers" },
  { label: "Schedule", path: "/schedule" },
  { label: "News", path: "/news" },
  { label: "Sponsors", path: "/sponsors" },
  { label: "History", path: "/history" },
];

/**
 * QR codes for the site's pages or any link, made in the browser.
 *
 * The presets are the public pages and each driver's page, as full addresses
 * when SITE_URL is set — the console's own host is not the site's, so a path
 * alone would point a phone nowhere. Unset, they are listed as paths and the
 * page says so.
 */
export default async function QrPage() {
  await requireAnySite();

  const base = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
  const at = (path: string) => (base ? `${base}${path === "/" ? "/" : path}` : path);

  let drivers: { label: string; slug: string }[] = [];
  try {
    const root = await getRootSite();
    drivers = (await listDrivers(root.id))
      .filter((driver) => driver.slug)
      .map((driver) => ({ label: `${driver.firstName} ${driver.lastName}`.trim() || driver.slug, slug: driver.slug }));
  } catch (error) {
    // The presets are a convenience; the tool works without the roster.
    console.error("[console/qr] drivers", error);
  }

  const presets: QrPreset[] = [
    ...PAGES.map((page) => ({ label: page.label, url: at(page.path), group: "Pages" })),
    ...drivers.map((driver) => ({ label: driver.label, url: at(`/drivers/${driver.slug}`), group: "Driver pages" })),
  ];

  return (
    <ConsolePage>
      <PageStrip
        title="QR codes"
        sub="A code for any page of the site or any link, for posters, the car and the pit board. Made in this browser; nothing is saved."
      />
      <QrMaker presets={presets} base={base} />
    </ConsolePage>
  );
}
