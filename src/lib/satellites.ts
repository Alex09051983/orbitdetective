import * as satellite from "satellite.js";

export interface TleEntry {
  name: string;
  noradId: number;
  line1: string;
  line2: string;
  satrec: satellite.SatRec;
  isStation: boolean;
}

export interface SatPosition {
  noradId: number;
  name: string;
  lat: number;
  lon: number;
  altKm: number;
  speedKmS: number;
  isStation: boolean;
}

export interface SatcatInfo {
  noradId: number;
  intlDesignator?: string;
  country?: string;
  launchDate?: string;
  launchSite?: string;
  decayDate?: string | null;
  period?: number;
  inclination?: number;
  apogee?: number;
  perigee?: number;
  rcs?: number;
  type?: string;
}

// Romania bounding box (with margin so we catch sats just crossing)
export const ROMANIA_BOUNDS = {
  minLat: 43.0,
  maxLat: 49.0,
  minLon: 19.5,
  maxLon: 30.5,
};
export const ROMANIA_CENTER: [number, number] = [45.9, 25.0];

export function isOverRomania(lat: number, lon: number) {
  return (
    lat >= ROMANIA_BOUNDS.minLat &&
    lat <= ROMANIA_BOUNDS.maxLat &&
    lon >= ROMANIA_BOUNDS.minLon &&
    lon <= ROMANIA_BOUNDS.maxLon
  );
}

/** Parse classic 3-line TLE blocks. */
export function parseTle(text: string, isStation = false): TleEntry[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const out: TleEntry[] = [];
  for (let i = 0; i < lines.length - 2; i++) {
    if (lines[i + 1]?.startsWith("1 ") && lines[i + 2]?.startsWith("2 ")) {
      const name = lines[i].trim();
      const l1 = lines[i + 1];
      const l2 = lines[i + 2];
      try {
        const satrec = satellite.twoline2satrec(l1, l2);
        const noradId = parseInt(l1.substring(2, 7).trim(), 10);
        if (!isNaN(noradId)) {
          out.push({ name, noradId, line1: l1, line2: l2, satrec, isStation });
        }
      } catch {
        // ignore bad entries
      }
      i += 2;
    }
  }
  return out;
}

export function computePosition(entry: TleEntry, date: Date): SatPosition | null {
  const pv = satellite.propagate(entry.satrec, date);
  if (!pv.position || typeof pv.position === "boolean") return null;
  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const lat = satellite.degreesLat(geo.latitude);
  const lon = satellite.degreesLong(geo.longitude);
  const altKm = geo.height;
  let speedKmS = 0;
  if (pv.velocity && typeof pv.velocity !== "boolean") {
    const v = pv.velocity;
    speedKmS = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
  return {
    noradId: entry.noradId,
    name: entry.name,
    lat,
    lon,
    altKm,
    speedKmS,
    isStation: entry.isStation,
  };
}

/** Compute ground track over +/- minutes around date. */
export function computeGroundTrack(
  entry: TleEntry,
  centerDate: Date,
  minutesAhead = 45,
  minutesBehind = 45,
  stepSec = 30,
): [number, number][] {
  const pts: [number, number][] = [];
  const start = centerDate.getTime() - minutesBehind * 60_000;
  const end = centerDate.getTime() + minutesAhead * 60_000;
  for (let t = start; t <= end; t += stepSec * 1000) {
    const p = computePosition(entry, new Date(t));
    if (p) pts.push([p.lat, p.lon]);
  }
  return pts;
}

/** Estimate forces acting on a satellite (rough magnitudes for educational display). */
export function estimateForces(altKm: number, massKg = 1000) {
  const earthMu = 3.986004418e14; // m^3/s^2
  const earthR = 6371; // km
  const r = (altKm + earthR) * 1000; // meters
  // Gravity (N) — F = G*M*m/r^2 ≈ mu*m/r^2
  const gravity = (earthMu * massKg) / (r * r);

  // Atmospheric drag — exponential model, very rough
  // rho ≈ rho0 * exp(-(alt-h0)/H)
  let rho = 0;
  if (altKm < 1000) {
    // simple piecewise
    const rho0 = 1.225e-9; // kg/m^3 reference at 200 km area
    rho = rho0 * Math.exp(-(altKm - 200) / 60);
  }
  const v = Math.sqrt(earthMu / r); // circular orbital speed m/s
  const Cd = 2.2;
  const A = 10; // m^2 assumed cross-section
  const drag = 0.5 * rho * v * v * Cd * A;

  // Solar radiation pressure
  const solarFlux = 1361; // W/m^2
  const c = 3e8;
  const srp = (solarFlux / c) * A * 1.3; // with reflectivity factor

  // Lunar gravitational perturbation (very rough order of magnitude)
  const moonMu = 4.9048695e12;
  const moonDist = 384_400_000;
  const lunarPerturb = (moonMu * massKg * r) / Math.pow(moonDist, 3);

  return { gravity, drag, srp, lunarPerturb, orbitalSpeed: v / 1000 };
}

/** Categorize satellite purpose from name + SATCAT info. */
export function inferPurpose(name: string, info?: SatcatInfo): string {
  const n = name.toUpperCase();
  if (/ISS|ZARYA|TIANGONG|CSS/.test(n)) return "Stație spațială cu echipaj uman";
  if (/STARLINK/.test(n)) return "Constelație internet în bandă largă (SpaceX)";
  if (/ONEWEB/.test(n)) return "Constelație internet OneWeb";
  if (/IRIDIUM/.test(n)) return "Comunicații satelitare globale (Iridium)";
  if (/GPS|NAVSTAR/.test(n)) return "Navigație globală GPS";
  if (/GLONASS/.test(n)) return "Navigație globală GLONASS (Rusia)";
  if (/GALILEO/.test(n)) return "Navigație globală Galileo (UE)";
  if (/BEIDOU/.test(n)) return "Navigație globală BeiDou (China)";
  if (/NOAA|METOP|GOES|HIMAWARI/.test(n)) return "Meteorologie";
  if (/LANDSAT|SENTINEL|TERRA|AQUA|MODIS/.test(n)) return "Observarea Pământului";
  if (/HUBBLE|HST|JWST|TESS|KEPLER/.test(n)) return "Observator astronomic";
  if (/COSMOS/.test(n)) return "Satelit Cosmos (Rusia, scop militar/civil mixt)";
  if (/USA |NROL/.test(n)) return "Satelit militar/de recunoaștere SUA";
  if (/INTELSAT|SES|EUTELSAT|VIASAT/.test(n)) return "Comunicații comerciale";
  if (/DEB|R\/B|ROCKET/.test(n)) return "Resturi spațiale / etaj de rachetă";
  if (info?.type) return info.type;
  return "Scop neclasificat (date publice limitate)";
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "Statele Unite",
  CIS: "Rusia / CSI",
  PRC: "China",
  ESA: "Agenția Spațială Europeană",
  FR: "Franța",
  JPN: "Japonia",
  IND: "India",
  UK: "Regatul Unit",
  GER: "Germania",
  ITSO: "Intelsat",
  SES: "SES",
  GLOB: "Globalstar",
  ORB: "Orbcomm",
  IRID: "Iridium",
  ROM: "România",
  CA: "Canada",
  ISRA: "Israel",
  KOR: "Coreea de Sud",
  AUS: "Australia",
  BRAZ: "Brazilia",
  ARGN: "Argentina",
  TURK: "Turcia",
  UAE: "Emiratele Arabe Unite",
};

export function countryName(code?: string): string {
  if (!code) return "Necunoscut";
  return COUNTRY_NAMES[code] ?? code;
}
