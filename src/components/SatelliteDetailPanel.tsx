import { useMemo } from "react";
import {
  computePosition,
  countryName,
  estimateForces,
  inferPurpose,
  type SatcatInfo,
  type TleEntry,
} from "@/lib/satellites";

interface Props {
  entry: TleEntry;
  info?: SatcatInfo;
  now: Date;
  onClose: () => void;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("ro-RO", { maximumFractionDigits: d, minimumFractionDigits: d });
}

function yearsSince(date?: string): string {
  if (!date) return "Necunoscut";
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const yrs = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return `${date} (acum ${yrs.toFixed(1)} ani)`;
}

export default function SatelliteDetailPanel({ entry, info, now, onClose }: Props) {
  const pos = useMemo(() => computePosition(entry, now), [entry, now]);
  const forces = useMemo(() => (pos ? estimateForces(pos.altKm, 1000) : null), [pos]);
  const purpose = useMemo(() => inferPurpose(entry.name, info), [entry.name, info]);

  // Trajectory direction (heading) — compare with position 30s ahead
  const heading = useMemo(() => {
    if (!pos) return null;
    const future = computePosition(entry, new Date(now.getTime() + 30_000));
    if (!future) return null;
    const dLon = future.lon - pos.lon;
    const dLat = future.lat - pos.lat;
    const angle = (Math.atan2(dLon, dLat) * 180) / Math.PI;
    const compass = ((angle + 360) % 360);
    const dirs = ["N", "NE", "E", "SE", "S", "SV", "V", "NV"];
    const dir = dirs[Math.round(compass / 45) % 8];
    return { compass, dir };
  }, [entry, now, pos]);

  if (!pos) return null;

  return (
    <aside className="panel-glow fixed right-0 top-0 z-[1000] flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card/95 p-6 backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-accent">
            NORAD #{entry.noradId} · {info?.intlDesignator ?? "—"}
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold text-foreground">{entry.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{purpose}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Închide"
        >
          ✕
        </button>
      </div>

      <Section title="Telemetrie live">
        <Stat label="Altitudine" value={`${fmt(pos.altKm, 1)} km`} accent />
        <Stat label="Viteză orbitală" value={`${fmt(pos.speedKmS, 3)} km/s`} accent />
        <Stat label="Latitudine" value={`${fmt(pos.lat, 4)}°`} />
        <Stat label="Longitudine" value={`${fmt(pos.lon, 4)}°`} />
        {heading && (
          <Stat label="Direcție" value={`${heading.dir} (${fmt(heading.compass, 0)}°)`} />
        )}
      </Section>

      <Section title="Orbită">
        <Stat label="Perigeu" value={info?.perigee ? `${fmt(info.perigee, 0)} km` : "—"} />
        <Stat label="Apogeu" value={info?.apogee ? `${fmt(info.apogee, 0)} km` : "—"} />
        <Stat
          label="Înclinație"
          value={info?.inclination ? `${fmt(info.inclination, 2)}°` : "—"}
        />
        <Stat
          label="Perioadă"
          value={info?.period ? `${fmt(info.period, 1)} min` : "—"}
        />
      </Section>

      {forces && (
        <Section title="Forțe care acționează (estimare, m=1000 kg)">
          <Stat label="Gravitație" value={`${forces.gravity.toExponential(2)} N`} accent />
          <Stat
            label="Drag atmosferic"
            value={forces.drag > 1e-9 ? `${forces.drag.toExponential(2)} N` : "≈ 0 N"}
          />
          <Stat label="Presiune solară (SRP)" value={`${forces.srp.toExponential(2)} N`} />
          <Stat
            label="Perturbații lunare"
            value={`${forces.lunarPerturb.toExponential(2)} N`}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Forțele depind de masa, secțiunea transversală și reflectivitatea reală a satelitului
            — valorile aici sunt ordine de mărime didactice.
          </p>
        </Section>
      )}

      <Section title="Istoric">
        <Stat label="Țară / operator" value={countryName(info?.country)} />
        <Stat label="Lansat" value={yearsSince(info?.launchDate)} />
        <Stat label="Loc lansare" value={info?.launchSite ?? "—"} />
        {info?.decayDate ? (
          <Stat label="Reintrare" value={info.decayDate} />
        ) : (
          <Stat label="Status" value="Activ pe orbită" accent />
        )}
        {info?.rcs && <Stat label="Secțiune radar" value={`${fmt(info.rcs, 3)} m²`} />}
      </Section>

      <Section title="TLE (Two-Line Element)">
        <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {entry.line1}
          {"\n"}
          {entry.line2}
        </pre>
      </Section>

      <p className="mt-auto pt-4 text-[10px] text-muted-foreground">
        Date: CelesTrak (TLE actualizat zilnic, propagare SGP4 în browser).
      </p>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={
          "font-mono text-sm tabular-nums " +
          (accent ? "text-accent" : "text-foreground")
        }
      >
        {value}
      </span>
    </div>
  );
}
