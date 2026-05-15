import { parseTle, type SatcatInfo, type TleEntry } from "./satellites";

const TLE_ACTIVE_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const TLE_STATIONS_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle";
const SATCAT_URL = "https://celestrak.org/pub/satcat.csv";

interface CachedTle {
  fetchedAt: number;
  entries: TleEntry[];
}
interface CachedSatcat {
  fetchedAt: number;
  map: Map<number, SatcatInfo>;
}

let tleCache: CachedTle | null = null;
let satcatCache: CachedSatcat | null = null;
const TWO_HOURS = 2 * 60 * 60 * 1000;

export async function fetchAllTle(): Promise<TleEntry[]> {
  if (tleCache && Date.now() - tleCache.fetchedAt < TWO_HOURS) {
    return tleCache.entries;
  }
  const [stationsRes, activeRes] = await Promise.all([
    fetch(TLE_STATIONS_URL).then((r) => r.text()),
    fetch(TLE_ACTIVE_URL).then((r) => r.text()),
  ]);
  const stations = parseTle(stationsRes, true);
  const active = parseTle(activeRes, false);
  const stationIds = new Set(stations.map((s) => s.noradId));
  const merged = [...stations, ...active.filter((a) => !stationIds.has(a.noradId))];
  tleCache = { fetchedAt: Date.now(), entries: merged };
  return merged;
}

export async function fetchSatcat(): Promise<Map<number, SatcatInfo>> {
  if (satcatCache && Date.now() - satcatCache.fetchedAt < TWO_HOURS) {
    return satcatCache.map;
  }
  try {
    const text = await fetch(SATCAT_URL).then((r) => r.text());
    const map = new Map<number, SatcatInfo>();
    const lines = text.split(/\r?\n/);
    // Header: OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE,PERIOD,INCLINATION,APOGEE,PERIGEE,RCS,DATA_STATUS_CODE,ORBIT_CENTER,ORBIT_TYPE
    const header = lines[0]?.split(",") ?? [];
    const idx = (k: string) => header.indexOf(k);
    const cNorad = idx("NORAD_CAT_ID");
    const cIntl = idx("OBJECT_ID");
    const cOwner = idx("OWNER");
    const cLaunch = idx("LAUNCH_DATE");
    const cSite = idx("LAUNCH_SITE");
    const cDecay = idx("DECAY_DATE");
    const cPeriod = idx("PERIOD");
    const cInc = idx("INCLINATION");
    const cApo = idx("APOGEE");
    const cPer = idx("PERIGEE");
    const cRcs = idx("RCS");
    const cType = idx("OBJECT_TYPE");
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row) continue;
      const cols = parseCsvLine(row);
      const id = parseInt(cols[cNorad], 10);
      if (isNaN(id)) continue;
      map.set(id, {
        noradId: id,
        intlDesignator: cols[cIntl],
        country: cols[cOwner],
        launchDate: cols[cLaunch],
        launchSite: cols[cSite],
        decayDate: cols[cDecay] || null,
        period: parseFloat(cols[cPeriod]) || undefined,
        inclination: parseFloat(cols[cInc]) || undefined,
        apogee: parseFloat(cols[cApo]) || undefined,
        perigee: parseFloat(cols[cPer]) || undefined,
        rcs: parseFloat(cols[cRcs]) || undefined,
        type: cols[cType],
      });
    }
    satcatCache = { fetchedAt: Date.now(), map };
    return map;
  } catch (e) {
    console.error("SATCAT fetch failed:", e);
    return new Map();
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
