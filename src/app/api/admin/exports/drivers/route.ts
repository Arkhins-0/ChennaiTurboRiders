import { guardRequestSite } from "@/lib/server/access";
import { listDrivers } from "@/lib/server/driversRepo";
import { csvResponse, exportFailed, stamp, toCsv } from "@/lib/server/exports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The roster as a spreadsheet, in the order the site shows it. */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "drivers");
  if (guard.denied) return guard.denied;

  try {
    const drivers = await listDrivers(guard.site.id);
    const csv = toCsv(
      [
        "First name",
        "Last name",
        "Number",
        "Nationality",
        "Country code",
        "Championship",
        "Car",
        "Date of birth",
        "Height",
        "Weight",
        "Race wins",
        "Pole positions",
        "Grands prix",
        "Podiums",
        "Fastest laps",
        "Points",
        "Address",
        "Photo",
      ],
      drivers.map((driver) => [
        driver.firstName,
        driver.lastName,
        driver.number || null,
        driver.nationality,
        driver.countryCode,
        driver.championship ?? "",
        driver.car ?? "",
        driver.dateOfBirth,
        driver.height,
        driver.weight,
        driver.stats.raceWins,
        driver.stats.polePositions,
        driver.stats.grandPrix,
        driver.stats.podiums,
        driver.stats.fastestLaps,
        driver.stats.points,
        `/drivers/${driver.slug}`,
        driver.image,
      ])
    );
    return csvResponse(`ctr-drivers-${stamp()}.csv`, csv);
  } catch (error) {
    return exportFailed("drivers", error);
  }
}
