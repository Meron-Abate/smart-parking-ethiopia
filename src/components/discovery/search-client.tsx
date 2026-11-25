"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DestinationSearch, type PlaceOption } from "./destination-search";
import { Select } from "@/components/ui/misc";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { formatETB } from "@/platform/money";
import { fmtAddis, fromAddisInput, toAddisInput } from "@/lib/addis-time";
import type { DiscoverResult, DiscoveredFacility } from "@/modules/discovery/service";

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-80 place-items-center rounded-lg border border-border bg-muted text-sm text-muted-foreground">Loading map…</div>,
});

const RADII = [500, 1000, 2000, 5000];
const DURATIONS = [30, 60, 120, 180, 240, 360, 480, 720, 1440];
const VEHICLES = ["MOTORCYCLE", "SEDAN", "SUV", "MINIBUS", "TRUCK"];
const FEATURES = ["CCTV", "SECURITY_GUARD", "LIGHTING", "EV_CHARGING", "CAR_WASH", "ATTENDANT"];
const ACRONYMS: Record<string, string> = { CCTV: "CCTV", EV_CHARGING: "EV charging" };
const label = (s: string) => ACRONYMS[s] ?? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const dur = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`);
const dist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

const STATUS_TEXT: Record<string, { text: string; cls: string }> = {
  AVAILABLE: { text: "Available", cls: "bg-emerald-100 text-emerald-900" },
  LIMITED: { text: "Few spaces left", cls: "bg-amber-100 text-amber-900" },
  FULL: { text: "Full", cls: "bg-stone-200 text-stone-800" },
  CLOSED: { text: "Closed", cls: "bg-stone-200 text-stone-800" },
  NOT_BOOKABLE: { text: "Not bookable", cls: "bg-stone-200 text-stone-800" },
  NO_PRICE: { text: "No price", cls: "bg-stone-200 text-stone-800" },
};

async function fetchDiscover(qs: string): Promise<DiscoverResult> {
  const res = await fetch(`/api/parking/discover?${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.details?.fieldErrors ? Object.values<string[]>(json.error.details.fieldErrors).flat()[0] : json.error?.message ?? "Search failed");
  return { facilities: json.data, meta: json.meta };
}

export function SearchClient({ defaultArrivalIso, role }: { defaultArrivalIso: string; role: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const cards = useRef(new Map<string, HTMLElement>());

  const lat = sp.get("lat");
  const lng = sp.get("lng");
  const name = sp.get("name");
  const arrivalIso = sp.get("arrivalAt") ?? defaultArrivalIso;
  const radius = Number(sp.get("radius") ?? 1000);
  const duration = Number(sp.get("durationMinutes") ?? 120);
  const vehicle = sp.get("vehicleType") ?? "SEDAN";
  const sort = sp.get("sort") ?? "distance";
  const features = (sp.get("features") ?? "").split(",").filter(Boolean);
  const maxEtb = sp.get("maxEtb") ?? "";
  const flag = (k: string) => sp.get(k) === "true";

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v === null || v === "" ? next.delete(k) : next.set(k, v));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const apiQs = useMemo(() => {
    if (!lat || !lng) return null;
    const q = new URLSearchParams({ lat, lng, radius: String(radius), arrivalAt: arrivalIso, durationMinutes: String(duration), vehicleType: vehicle, sort });
    if (name) q.set("destinationName", name);
    for (const k of ["covered", "indoor", "open24", "showUnavailable"]) if (flag(k)) q.set(k, "true");
    if (features.length) q.set("features", features.join(","));
    if (maxEtb && Number(maxEtb) > 0) q.set("maxPriceCents", String(Math.round(Number(maxEtb) * 100)));
    return q.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, defaultArrivalIso]);

  const { data, error, isFetching, isPending } = useQuery({ queryKey: ["discover", apiQs], queryFn: () => fetchDiscover(apiQs!), enabled: apiQs !== null, staleTime: 20_000 });

  // an old selection must not point at a facility that is no longer listed
  useEffect(() => {
    if (selected && data && !data.facilities.some((f) => f.id === selected)) setSelected(null);
  }, [data, selected]);

  function pick(id: string, fromMap: boolean) {
    setSelected(id);
    if (fromMap) {
      setView("list");
      setTimeout(() => cards.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    }
  }

  const onDestination = (p: PlaceOption) => update({ lat: String(p.latitude), lng: String(p.longitude), name: p.name });
  const dest = lat && lng ? { latitude: Number(lat), longitude: Number(lng), name } : null;

  const reserveHref = (facilityId: string) => {
    const q = new URLSearchParams({ facilityId, startAt: arrivalIso, durationMinutes: String(duration) });
    if (name) q.set("destName", name);
    if (lat && lng) { q.set("lat", lat); q.set("lng", lng); }
    return "/reserve?" + q.toString();
  };

  const toggleFeature = (k: string) => update({ features: (features.includes(k) ? features.filter((x) => x !== k) : [...features, k]).join(",") });

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10">
      <section aria-label="Search" className="space-y-3 py-4">
        <div>
          <label htmlFor="destination" className="text-sm font-medium">Destination</label>
          <DestinationSearch initialValue={name ?? ""} onSelect={onDestination} id="destination" autoFocus={!dest} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="col-span-2 space-y-1.5 md:col-span-2">
            <label htmlFor="arrival" className="text-sm font-medium">Arriving (Addis Ababa time)</label>
            <Input id="arrival" type="datetime-local" value={toAddisInput(new Date(arrivalIso))} onChange={(e) => { const iso = fromAddisInput(e.target.value); if (iso) update({ arrivalAt: iso }); }} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dur" className="text-sm font-medium">Staying</label>
            <Select id="dur" value={duration} onChange={(e) => update({ durationMinutes: e.target.value })}>
              {(DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b)).map((d) => <option key={d} value={d}>{dur(d)}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="vehicle" className="text-sm font-medium">Vehicle</label>
            <Select id="vehicle" value={vehicle} onChange={(e) => update({ vehicleType: e.target.value })}>
              {VEHICLES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="radius" className="text-sm font-medium">Within</label>
            <Select id="radius" value={radius} onChange={(e) => update({ radius: e.target.value })}>
              {RADII.map((r) => <option key={r} value={r}>{dist(r)} of destination</option>)}
            </Select>
          </div>
        </div>

        <details className="rounded-md border border-border bg-card px-3 py-2">
          <summary className="min-h-9 cursor-pointer text-sm font-medium">Filters and sorting</summary>
          <div className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor="sort" className="text-sm font-medium">Sort by</label>
              <Select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value })}>
                <option value="distance">Closest to destination</option>
                <option value="price">Lowest price</option>
                <option value="availability">Most spaces free</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="maxEtb" className="text-sm font-medium">Max total price (ETB)</label>
              <Input id="maxEtb" inputMode="decimal" defaultValue={maxEtb} onBlur={(e) => update({ maxEtb: e.target.value.trim() })} placeholder="No limit" />
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium">Must have</legend>
              <div className="flex flex-wrap gap-x-4">
                {([["covered", "Covered"], ["indoor", "Indoor"], ["open24", "Open 24 hours"]] as const).map(([k, l]) => (
                  <label key={k} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={flag(k)} onChange={(e) => update({ [k]: e.target.checked ? "true" : null })} />{l}</label>
                ))}
                {FEATURES.map((k) => (
                  <label key={k} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={features.includes(k)} onChange={() => toggleFeature(k)} />{label(k)}</label>
                ))}
              </div>
            </fieldset>
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4" checked={flag("showUnavailable")} onChange={(e) => update({ showUnavailable: e.target.checked ? "true" : null })} />Also show full or closed facilities</label>
          </div>
        </details>
      </section>

      {!dest ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          Choose a destination above to see parking around it.
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2" aria-live="polite">
            <p className="text-sm text-muted-foreground">
              {error ? "" : isPending ? "Searching…" : data ? (
                <>
                  <strong className="text-foreground">{data.meta.total}</strong> {data.meta.total === 1 ? "facility" : "facilities"} within {dist(data.meta.radiusMeters)} of <strong className="text-foreground">{name ?? "your destination"}</strong>
                  {" · "}{fmtAddis(data.meta.arrivalAt)} for {dur(data.meta.durationMinutes)}
                  {data.meta.hiddenUnavailable > 0 && ` · ${data.meta.hiddenUnavailable} full or closed hidden`}
                  {isFetching && " · updating…"}
                </>
              ) : null}
            </p>
            <div className="flex gap-1 lg:hidden" role="group" aria-label="View">
              <Button type="button" variant={view === "list" ? "primary" : "outline"} onClick={() => setView("list")} aria-pressed={view === "list"}>List</Button>
              <Button type="button" variant={view === "map" ? "primary" : "outline"} onClick={() => setView("map")} aria-pressed={view === "map"}>Map</Button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              {(error as Error).message}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[26rem_1fr]">
            <ul className={`space-y-3 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1 ${view === "map" ? "hidden lg:block" : ""}`} aria-label="Parking facilities">
              {data?.facilities.length === 0 && (
                <li className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No parking is available around this destination for your time and vehicle.
                  Try a wider distance, a different time, or turn on &ldquo;Also show full or closed facilities&rdquo;.
                </li>
              )}
              {data?.facilities.map((f) => (
                <FacilityCard key={f.id} f={f} role={role} reserveHref={reserveHref(f.id)} selected={f.id === selected} onSelect={() => pick(f.id, false)} register={(el) => { if (el) cards.current.set(f.id, el); else cards.current.delete(f.id); }} />
              ))}
            </ul>
            <div className={`h-[70vh] lg:sticky lg:top-4 lg:h-[calc(100vh-14rem)] ${view === "list" ? "hidden lg:block" : ""}`}>
              {dest && <MapView destination={dest} radius={radius} facilities={data?.facilities ?? []} selectedId={selected} onSelect={(id) => pick(id, true)} />}
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Prices are estimates for your stay and may change before you book. Walking times are straight-line estimates, not routed directions.
          </p>
        </>
      )}
    </div>
  );
}

function FacilityCard({ f, role, reserveHref, selected, onSelect, register }: { f: DiscoveredFacility; role: string | null; reserveHref: string; selected: boolean; onSelect: () => void; register: (el: HTMLElement | null) => void }) {
  const s = STATUS_TEXT[f.status]!;
  return (
    <li ref={register} className={`rounded-lg border bg-card p-4 ${selected ? "border-primary ring-2 ring-primary" : "border-border"} ${f.bookable ? "" : "opacity-80"}`}>
      <button type="button" onClick={onSelect} className="block w-full text-left" aria-pressed={selected}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{f.name}</h3>
            <p className="text-sm text-muted-foreground">{f.neighborhood ? `${f.neighborhood} · ` : ""}{f.address}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.text}</span>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">From destination</dt><dd className="font-medium">{dist(f.distanceMeters)}</dd><dd className="text-xs text-muted-foreground">~{f.walk.minutes} min walk (est.)</dd></div>
          <div><dt className="text-xs text-muted-foreground">Est. total</dt><dd className="font-medium">{f.estimatedFeeCents != null ? formatETB(f.estimatedFeeCents) : "—"}</dd>{f.firstUnitCents != null && <dd className="text-xs text-muted-foreground">from {formatETB(f.firstUnitCents)}/{f.unit === "DAILY" ? "day" : "h"}</dd>}</div>
          <div><dt className="text-xs text-muted-foreground">Free for your stay</dt><dd className="font-medium">{f.availableUnits ?? "—"}</dd><dd className="text-xs text-muted-foreground">of {f.totalCapacity}</dd></div>
        </dl>
        {f.reason && <p className="mt-2 text-sm text-muted-foreground">{f.reason}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          Open {f.hoursToday}
          {f.isCovered && " · Covered"}{f.isIndoor && " · Indoor"}
          {f.features.length > 0 && ` · ${f.features.map(label).join(", ")}`}
        </p>
      </button>
      <div className="mt-3">
        {!f.bookable ? (
          <Button type="button" disabled className="w-full">Not available for your time</Button>
        ) : role === "DRIVER" ? (
          <Link href={reserveHref} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Reserve</Link>
        ) : role === null ? (
          <Link href={"/login?next=" + encodeURIComponent(reserveHref)} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Sign in to reserve</Link>
        ) : (
          <Button type="button" disabled className="w-full" title="Only driver accounts can reserve">Reserve (driver accounts only)</Button>
        )}
      </div>
    </li>
  );
}
