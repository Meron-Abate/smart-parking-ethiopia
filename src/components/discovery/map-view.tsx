"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatETB } from "@/platform/money";
import type { DiscoveredFacility } from "@/modules/discovery/service";

interface Props {
  destination: { latitude: number; longitude: number; name: string | null };
  radius: number;
  facilities: DiscoveredFacility[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const COLOR: Record<string, string> = { AVAILABLE: "#0f6b4f", LIMITED: "#b45309" };

/**
 * OpenStreetMap tiles via Leaflet. NOTE: tile.openstreetmap.org is fine for development and low traffic;
 * production needs a tile provider agreement (OSM Tile Usage Policy) and proper attribution.
 * Marker text is set with textContent, never innerHTML, so facility names cannot inject markup.
 */
export default function MapView({ destination, radius, facilities, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const latest = useRef({ destination, radius, facilities });
  latest.current = { destination, radius, facilities };

  function draw() {
    const L = lib.current;
    const m = map.current;
    const g = layer.current;
    if (!L || !m || !g) return;
    const { destination: d, radius: r, facilities: list } = latest.current;
    g.clearLayers();
    markers.current.clear();
    const dest = L.latLng(d.latitude, d.longitude);
    const circle = L.circle(dest, { radius: r, color: "#0f6b4f", weight: 1.5, fillOpacity: 0.05 }).addTo(g);

    const pin = document.createElement("div");
    pin.setAttribute("aria-hidden", "true");
    pin.style.cssText = "width:18px;height:18px;border-radius:50%;background:#1c1917;border:3px solid #fff;box-shadow:0 0 0 2px #1c1917";
    const destTip = document.createElement("div");
    destTip.textContent = d.name ?? "Destination";
    L.marker(dest, { icon: L.divIcon({ html: pin, className: "", iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false, zIndexOffset: 1000 })
      .bindTooltip(destTip)
      .addTo(g);

    for (const f of list) {
      const chip = document.createElement("div");
      chip.textContent = f.estimatedFeeCents != null ? formatETB(f.estimatedFeeCents).replace(/ETB|\s/g, "") : "P";
      chip.style.cssText = `background:${COLOR[f.status] ?? "#78716c"};color:#fff;font:600 12px system-ui;padding:3px 8px;border-radius:999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap;text-align:center`;
      const tip = document.createElement("div");
      tip.textContent = f.name;
      const marker = L.marker([f.latitude, f.longitude], {
        icon: L.divIcon({ html: chip, className: "", iconSize: [72, 24], iconAnchor: [36, 12] }),
        title: f.name,
        alt: f.name,
        keyboard: true,
      })
        .bindTooltip(tip, { direction: "top", offset: [0, -12] })
        .on("click", () => onSelectRef.current(f.id))
        .addTo(g);
      markers.current.set(f.id, marker);
    }
    m.fitBounds(circle.getBounds(), { padding: [24, 24] });
  }

  // create the map once
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      lib.current = L;
      const { destination: d } = latest.current;
      map.current = L.map(el.current).setView([d.latitude, d.longitude], 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      // The container can start hidden (mobile "List" view) or resize; Leaflet must be told, then re-fit.
      ro = new ResizeObserver(() => {
        if (el.current && el.current.offsetWidth > 0) {
          map.current?.invalidateSize();
          draw();
        }
      });
      ro.observe(el.current);
      draw();
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.latitude, destination.longitude, destination.name, radius, facilities]);

  useEffect(() => {
    markers.current.forEach((mk, id) => mk.setZIndexOffset(id === selectedId ? 900 : 0));
    const sel = selectedId ? markers.current.get(selectedId) : null;
    if (sel && map.current) {
      sel.openTooltip();
      map.current.panTo(sel.getLatLng());
    }
  }, [selectedId]);

  return <div ref={el} role="region" aria-label="Map of parking near your destination" className="h-full min-h-80 w-full rounded-lg border border-border" />;
}
