import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Rectangle, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import {
  ROMANIA_BOUNDS,
  ROMANIA_CENTER,
  computeGroundTrack,
  type SatPosition,
  type TleEntry,
} from "@/lib/satellites";

interface Props {
  positions: SatPosition[];
  tleById: Map<number, TleEntry>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  now: Date;
}

function makeIcon(kind: "sat" | "station" | "selected") {
  return L.divIcon({
    className: "",
    html: `<div class="sat-marker ${kind === "station" ? "station" : kind === "selected" ? "selected" : ""}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export default function SatelliteMap({ positions, tleById, selectedId, onSelect, now }: Props) {
  const iconSat = useRef(makeIcon("sat")).current;
  const iconStation = useRef(makeIcon("station")).current;
  const iconSelected = useRef(makeIcon("selected")).current;

  const track = useMemo(() => {
    if (selectedId == null) return null;
    const entry = tleById.get(selectedId);
    if (!entry) return null;
    return computeGroundTrack(entry, now, 45, 45, 30);
  }, [selectedId, tleById, now]);

  // Split track on antimeridian crossings
  const trackSegments = useMemo(() => {
    if (!track) return [];
    const segs: [number, number][][] = [[]];
    for (let i = 0; i < track.length; i++) {
      const cur = track[i];
      const prev = track[i - 1];
      if (prev && Math.abs(cur[1] - prev[1]) > 180) {
        segs.push([]);
      }
      segs[segs.length - 1].push(cur);
    }
    return segs;
  }, [track]);

  return (
    <MapContainer
      center={ROMANIA_CENTER}
      zoom={6}
      minZoom={3}
      maxZoom={10}
      worldCopyJump
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Rectangle
        bounds={[
          [ROMANIA_BOUNDS.minLat, ROMANIA_BOUNDS.minLon],
          [ROMANIA_BOUNDS.maxLat, ROMANIA_BOUNDS.maxLon],
        ]}
        pathOptions={{
          color: "oklch(0.85 0.13 210)",
          weight: 1.5,
          fillOpacity: 0.04,
          dashArray: "4 4",
        }}
      />
      {trackSegments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg}
          pathOptions={{ color: "oklch(0.9 0.2 50)", weight: 2, opacity: 0.7 }}
        />
      ))}
      {positions.map((p) => (
        <Marker
          key={p.noradId}
          position={[p.lat, p.lon]}
          icon={
            p.noradId === selectedId
              ? iconSelected
              : p.isStation
                ? iconStation
                : iconSat
          }
          eventHandlers={{ click: () => onSelect(p.noradId) }}
        >
          <Popup>
            <div style={{ fontFamily: "Space Grotesk", fontSize: 12 }}>
              <strong>{p.name}</strong>
              <br />
              {p.altKm.toFixed(0)} km · {p.speedKmS.toFixed(2)} km/s
              <br />
              <button
                onClick={() => onSelect(p.noradId)}
                style={{
                  marginTop: 4,
                  background: "oklch(0.74 0.16 295)",
                  color: "white",
                  border: 0,
                  padding: "4px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Vezi detalii →
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
