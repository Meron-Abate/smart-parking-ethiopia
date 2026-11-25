"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

const ADDIS: [number, number] = [9.0107, 38.7612];

/** Click (or drag the pin) to set the facility location. Coordinates are still editable as text; the server validates them. */
export default function LocationPicker({ latitude, longitude, onChange }: { latitude: number | null; longitude: number | null; onChange: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const pos = useRef({ latitude, longitude });
  pos.current = { latitude, longitude };

  const round = (n: number) => Math.round(n * 1e6) / 1e6;

  function place(lat: number, lng: number, pan: boolean) {
    const L = lib.current;
    const m = map.current;
    if (!L || !m) return;
    if (!marker.current) {
      const pin = document.createElement("div");
      pin.style.cssText = "width:20px;height:20px;border-radius:50%;background:#0f6b4f;border:3px solid #fff;box-shadow:0 0 0 2px #0f6b4f";
      marker.current = L.marker([lat, lng], { draggable: true, icon: L.divIcon({ html: pin, className: "", iconSize: [20, 20], iconAnchor: [10, 10] }), title: "Facility location (drag to adjust)" }).addTo(m);
      marker.current.on("dragend", () => {
        const p = marker.current!.getLatLng();
        cb.current(round(p.lat), round(p.lng));
      });
    } else marker.current.setLatLng([lat, lng]);
    if (pan) m.setView([lat, lng], Math.max(m.getZoom(), 16));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      lib.current = L;
      const start = pos.current.latitude != null && pos.current.longitude != null ? ([pos.current.latitude, pos.current.longitude] as [number, number]) : ADDIS;
      map.current = L.map(el.current).setView(start, pos.current.latitude != null ? 16 : 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map.current);
      map.current.on("click", (e: Leaflet.LeafletMouseEvent) => {
        place(e.latlng.lat, e.latlng.lng, false);
        cb.current(round(e.latlng.lat), round(e.latlng.lng));
      });
      if (pos.current.latitude != null && pos.current.longitude != null) place(pos.current.latitude, pos.current.longitude, false);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the pin in sync when coordinates are typed or chosen from the search box
  useEffect(() => {
    if (latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const cur = marker.current?.getLatLng();
      if (!cur || Math.abs(cur.lat - latitude) > 1e-7 || Math.abs(cur.lng - longitude) > 1e-7) place(latitude, longitude, !cur || map.current?.getBounds().contains([latitude, longitude]) === false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  return <div ref={el} role="region" aria-label="Map: click to set the facility location" className="h-72 w-full rounded-md border border-border" />;
}
