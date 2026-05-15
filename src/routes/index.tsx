import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  computePosition,
  isOverRomania,
  type SatPosition,
  type SatcatInfo,
  type TleEntry,
} from "@/lib/satellites";
import { fetchAllTle, fetchSatcat } from "@/lib/satelliteSources";
import SatelliteDetailPanel from "@/components/SatelliteDetailPanel";

const SatelliteMap = lazy(() => import("@/components/SatelliteMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OrbitRO — Sateliți deasupra României în timp real" },
      {
        name: "description",
        content:
          "Hartă live cu sateliții care trec deasupra României acum: ISS, Starlink, GPS, observație. Click pe oricare pentru viteză, altitudine, traiectorie și forțe care acționează.",
      },
      { property: "og:title", content: "OrbitRO — Sateliți deasupra României" },
      {
        property: "og:description",
        content:
          "Tracking live al sateliților deasupra României, calculat în browser cu propagare SGP4.",
      },
    ],
  }),
  component: HomePage,
});

type Filter = "all" | "stations" | "starlink" | "navigation" | "observation";

function categoryOf(name: string): Filter[] {
  const n = name.toUpperCase();
  const cats: Filter[] = ["all"];
  if (/ISS|ZARYA|TIANGONG|CSS/.test(n)) cats.push("stations");
  if (/STARLINK/.test(n)) cats.push("starlink");
  if (/GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU/.test(n)) cats.push("navigation");
  if (/NOAA|METOP|GOES|LANDSAT|SENTINEL|TERRA|AQUA|HIMAWARI/.test(n)) cats.push("observation");
  return cats;
}

function HomePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="mt-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Inițializare tracking orbital…
          </p>
        </div>
      </div>
    );
  }

  return <HomePageClient />;
}

function HomePageClient() {
  const [tle, setTle] = useState<TleEntry[]>([]);
  const [satcat, setSatcat] = useState<Map<number, SatcatInfo>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  // Fetch TLE + SATCAT once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [tleData, satcatData] = await Promise.all([
          fetchAllTle(),
          fetchSatcat().catch(() => new Map<number, SatcatInfo>()),
        ]);
        if (!alive) return;
        setTle(tleData);
        setSatcat(satcatData);
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setError("Nu am putut încărca datele TLE de pe CelesTrak. Verifică conexiunea.");
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Tick clock every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tleById = useMemo(() => {
    const m = new Map<number, TleEntry>();
    tle.forEach((t) => m.set(t.noradId, t));
    return m;
  }, [tle]);

  const filteredTle = useMemo(() => {
    if (filter === "all") return tle;
    return tle.filter((t) => categoryOf(t.name).includes(filter));
  }, [tle, filter]);

  // Compute positions of those over Romania
  const positionsOverRO = useMemo<SatPosition[]>(() => {
    const out: SatPosition[] = [];
    for (const entry of filteredTle) {
      const p = computePosition(entry, now);
      if (p && isOverRomania(p.lat, p.lon, p.altKm)) out.push(p);
    }
    // Sort: stations first, then by altitude
    out.sort((a, b) => Number(b.isStation) - Number(a.isStation) || a.altKm - b.altKm);
    return out;
  }, [filteredTle, now]);

  const selectedEntry = selectedId != null ? tleById.get(selectedId) : undefined;

  return (
    <div className="relative min-h-screen">
      {/* Header */}
      <header className="relative z-[500] border-b border-border bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-3 w-3 rounded-full bg-accent shadow-[0_0_12px_var(--cyan)]" />
              <div className="absolute inset-0 h-3 w-3 animate-ping rounded-full bg-accent opacity-50" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight">
                Orbit<span className="text-accent">RO</span>
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Sateliți deasupra României · live
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-mono text-xs text-muted-foreground">UTC</div>
              <div className="font-mono text-sm tabular-nums text-foreground">
                {now.toISOString().slice(11, 19)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xs text-muted-foreground">Vizibili</div>
              <div className="font-mono text-sm tabular-nums text-accent">
                {positionsOverRO.length}
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-5 pb-3">
          {(
            [
              ["all", "Toți"],
              ["stations", "Stații (ISS+)"],
              ["starlink", "Starlink"],
              ["navigation", "Navigație"],
              ["observation", "Observație"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={
                "rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition " +
                (filter === key
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Map area */}
      <main className="relative z-10">
        <div className="relative mx-auto max-w-7xl px-5 py-5">
          <div className="relative h-[calc(100vh-220px)] min-h-[520px] overflow-hidden rounded-xl border border-border shadow-2xl">
            {!loading ? (
              <Suspense fallback={<MapSkeleton />}>
                <SatelliteMap
                  positions={positionsOverRO}
                  tleById={tleById}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  now={now}
                />
              </Suspense>
            ) : (
              <MapSkeleton />
            )}
            {error && (
              <div className="absolute inset-0 z-[400] flex items-center justify-center bg-background/80 p-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>

          {/* List below map */}
          <section className="mt-6">
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-accent">
              Acum deasupra României ({positionsOverRO.length})
            </h2>
            {positionsOverRO.length === 0 ? (
              <p className="rounded-md border border-border bg-card/40 p-4 text-sm text-muted-foreground">
                {loading
                  ? "Se încarcă cataloagele de sateliți de la CelesTrak…"
                  : "Niciun satelit din categoria curentă nu este chiar acum deasupra României. Așteaptă câteva secunde — orbitele se mișcă ~7 km/s."}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {positionsOverRO.slice(0, 30).map((p) => (
                  <li key={p.noradId}>
                    <button
                      onClick={() => setSelectedId(p.noradId)}
                      className={
                        "group w-full rounded-lg border p-3 text-left transition " +
                        (selectedId === p.noradId
                          ? "border-accent bg-accent/5"
                          : "border-border bg-card/40 hover:border-primary hover:bg-card/70")
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-display text-sm font-semibold text-foreground">
                          {p.name}
                        </span>
                        {p.isStation && (
                          <span className="font-mono text-[9px] uppercase tracking-wider text-primary">
                            station
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
                        <span>{p.altKm.toFixed(0)} km alt</span>
                        <span>{p.speedKmS.toFixed(2)} km/s</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {positionsOverRO.length > 30 && (
              <p className="mt-2 text-center font-mono text-[10px] text-muted-foreground">
                + {positionsOverRO.length - 30} alți sateliți pe hartă
              </p>
            )}
          </section>

          <footer className="mt-8 border-t border-border pt-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Propagare SGP4 în browser · TLE & SATCAT: celestrak.org · OpenStreetMap
          </footer>
        </div>
      </main>

      {selectedEntry && (
        <SatelliteDetailPanel
          entry={selectedEntry}
          info={satcat.get(selectedEntry.noradId)}
          now={now}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-card/40">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="mt-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Se inițializează tracking-ul orbital…
        </p>
      </div>
    </div>
  );
}
