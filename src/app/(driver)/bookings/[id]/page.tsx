import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/modules/auth/current-user";
import { cancellationRefundCents, getMyReservation } from "@/modules/reservations/service";
import { AppError } from "@/platform/errors";
import { ReservationBadge } from "@/components/booking/reservation-badge";
import { BookingActions } from "@/components/booking/booking-actions";
import { fmtAddis } from "@/lib/addis-time";
import { formatETB } from "@/platform/money";

export const dynamic = "force-dynamic";

interface Snapshot {
  reservation?: { allowExtensions?: boolean };
  cancellation?: { freeCancelBeforeMinutes: number; refundPercentBefore: number; refundPercentAfter: number };
}

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageRole("DRIVER");
  let r;
  try {
    r = await getMyReservation(user, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const snap = r.policySnapshot as Snapshot | null;
  const pending = r.extensions.find((e) => e.status === "PENDING_PAYMENT") ?? null;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/bookings" className="text-sm underline">&larr; My bookings</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{r.facility.name}</h1>
          <ReservationBadge status={r.status} />
        </div>
        <p className="text-sm text-muted-foreground">Reference <strong className="text-foreground">{r.reference}</strong></p>
      </div>

      <BookingActions
        id={r.id}
        status={r.status}
        startAt={r.startAt.toISOString()}
        endAt={r.endAt.toISOString()}
        holdExpiresAt={iso(r.holdExpiresAt)}
        depositCents={r.depositCents}
        refundIfCancelledNowCents={cancellationRefundCents(r, new Date())}
        allowExtensions={snap?.reservation?.allowExtensions ?? true}
        pendingExtension={pending ? { id: pending.id, additionalFeeCents: pending.additionalFeeCents, newEndAt: pending.newEndAt.toISOString(), holdExpiresAt: iso(pending.holdExpiresAt) } : null}
        showSimulator={process.env.NODE_ENV !== "production"}
      />

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-semibold">Details</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Arrive</dt><dd className="font-medium">{fmtAddis(r.startAt.toISOString())}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Leave by</dt><dd className="font-medium">{fmtAddis(r.endAt.toISOString())}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Vehicle</dt><dd className="font-medium">{r.vehicle.plateNumber}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Space</dt><dd className="font-medium">{r.space?.label ?? "Assigned on arrival"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Estimated fee</dt><dd className="font-medium">{formatETB(r.estimatedFeeCents)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Deposit</dt><dd className="font-medium">{formatETB(r.depositCents)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Address</dt><dd className="font-medium">{r.facility.address}</dd></div>
          {r.destinationName && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Going to</dt><dd className="font-medium">{r.destinationName}</dd></div>}
        </dl>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Arrive within {r.graceMinutes} minutes of your arrival time.</li>
          {snap?.cancellation && <li>Free cancellation until {snap.cancellation.freeCancelBeforeMinutes} minutes before arrival ({snap.cancellation.refundPercentBefore}% of the deposit back), then {snap.cancellation.refundPercentAfter}%.</li>}
        </ul>
        {r.extensions.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium">Extensions</h3>
            <ul className="text-sm text-muted-foreground">
              {r.extensions.map((e) => <li key={e.id}>Until {fmtAddis(e.newEndAt.toISOString())} · {formatETB(e.additionalFeeCents)} · {e.status.replace(/_/g, " ").toLowerCase()}</li>)}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
