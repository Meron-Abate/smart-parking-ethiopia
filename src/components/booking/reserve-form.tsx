"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/misc";
import { FormMessage } from "@/components/ui/misc";
import { VehicleForm, type VehicleRow } from "@/components/vehicles/vehicles-manager";
import { api, ApiError } from "@/lib/api-client";
import { fmtAddis } from "@/lib/addis-time";
import { formatETB } from "@/platform/money";

interface Quote {
  facility: { id: string; name: string; address: string; neighborhood: string | null; inventoryModel: string; isCovered: boolean; features: string[] };
  startAt: string;
  endAt: string;
  durationMinutes: number;
  bookable: boolean;
  reason: string | null;
  feeCents: number | null;
  depositCents: number | null;
  availableUnits: number | null;
  graceMinutes: number;
  holdMinutes: number;
  reservationPolicy: { depositPercent: number } | null;
  cancellationPolicy: { freeCancelBeforeMinutes: number; refundPercentBefore: number; refundPercentAfter: number; forfeitDepositOnNoShow: boolean } | null;
}

const dur = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`);

export function ReserveForm({
  facilityId, startAt, durationMinutes, destination, initialVehicles,
}: {
  facilityId: string;
  startAt: string;
  durationMinutes: number;
  destination: { name?: string; latitude?: number; longitude?: number };
  initialVehicles: VehicleRow[];
}) {
  const router = useRouter();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [vehicleId, setVehicleId] = useState(initialVehicles.find((v) => v.isDefault)?.id ?? initialVehicles[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const { data: q, error: qErr, isFetching } = useQuery({
    queryKey: ["quote", facilityId, startAt, durationMinutes, vehicle?.type ?? "SEDAN"],
    queryFn: () => api<Quote>(`/api/reservations/quote?${new URLSearchParams({ facilityId, startAt, durationMinutes: String(durationMinutes), vehicleType: vehicle?.type ?? "SEDAN" })}`, "GET"),
    staleTime: 10_000,
  });

  async function reserve() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string }>("/api/reservations", "POST", { facilityId, vehicleId, startAt, durationMinutes, destination: Object.keys(destination).length ? destination : undefined });
      router.push(`/bookings/${r.id}`);
      router.refresh();
    } catch (x) {
      setError((x as ApiError).message);
      setBusy(false);
    }
  }

  const c = q?.cancellationPolicy;
  return (
    <div className="max-w-2xl space-y-5">
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{q?.facility.name ?? "Parking"}</h2>
        {q && <p className="text-sm text-muted-foreground">{q.facility.neighborhood ? `${q.facility.neighborhood} · ` : ""}{q.facility.address}</p>}
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Arrive</dt><dd className="font-medium">{fmtAddis(startAt)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Leave by</dt><dd className="font-medium">{q ? fmtAddis(q.endAt) : "…"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Stay</dt><dd className="font-medium">{dur(durationMinutes)}</dd></div>
          {destination.name && <div><dt className="text-xs text-muted-foreground">Going to</dt><dd className="font-medium">{destination.name}</dd></div>}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Times are Addis Ababa time.</p>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Your vehicle</h2>
        {vehicles.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            <label htmlFor="veh" className="text-sm font-medium">Vehicle</label>
            <Select id="veh" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber} · {v.type.toLowerCase()}</option>)}
            </Select>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted-foreground">Add the vehicle you will park.</p>
            <VehicleForm onAdded={(v) => { setVehicles([v]); setVehicleId(v.id); }} />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5" aria-live="polite">
        <h2 className="text-lg font-semibold">Price and policy</h2>
        {qErr && <p role="alert" className="mt-2 text-sm text-danger">{(qErr as Error).message}</p>}
        {q && (
          <>
            {q.feeCents != null && (
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Estimated parking fee</dt><dd className="text-xl font-semibold">{formatETB(q.feeCents)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Deposit to secure the space ({q.reservationPolicy?.depositPercent}%)</dt><dd className="text-xl font-semibold">{formatETB(q.depositCents ?? 0)}</dd></div>
              </dl>
            )}
            {!q.bookable && <p role="alert" className="mt-3 text-sm text-danger">{q.reason}</p>}
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>We hold your space for {q.holdMinutes} minutes while you pay the deposit.</li>
              <li>Please arrive within {q.graceMinutes} minutes of your arrival time or the booking may be released{c?.forfeitDepositOnNoShow ? " and the deposit kept" : ""}.</li>
              {c && <li>Free cancellation until {dur(c.freeCancelBeforeMinutes)} before arrival ({c.refundPercentBefore}% of the deposit back); after that {c.refundPercentAfter}% back.</li>}
              <li>The fee is an estimate for the time you booked; the final amount is settled when you leave.</li>
            </ul>
          </>
        )}
        <div className="mt-4 space-y-2">
          <Button type="button" className="w-full" disabled={busy || !q?.bookable || !vehicleId || isFetching} onClick={reserve}>
            {busy ? "Reserving…" : "Reserve and hold this space"}
          </Button>
          <FormMessage error={error} />
        </div>
      </section>
    </div>
  );
}
