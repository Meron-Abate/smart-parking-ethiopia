import Link from "next/link";
import { requirePageRole } from "@/modules/auth/current-user";
import { listMyReservations } from "@/modules/reservations/service";
import { ReservationBadge } from "@/components/booking/reservation-badge";
import { fmtAddis } from "@/lib/addis-time";
import { formatETB } from "@/platform/money";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof listMyReservations>>[number];

function BookingRow({ r }: { r: Row }) {
  return (
    <li>
      <Link href={`/bookings/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4 hover:bg-muted">
        <div>
          <p className="font-medium">{r.facility.name}</p>
          <p className="text-sm text-muted-foreground">{fmtAddis(r.startAt.toISOString())} · {r.vehicle.plateNumber} · {r.reference}</p>
        </div>
        <div className="text-right">
          <ReservationBadge status={r.status} />
          <p className="mt-1 text-sm text-muted-foreground">{formatETB(r.estimatedFeeCents)} est.</p>
        </div>
      </Link>
    </li>
  );
}

export default async function BookingsPage() {
  const user = await requirePageRole("DRIVER");
  const [upcoming, past] = await Promise.all([listMyReservations(user, "upcoming"), listMyReservations(user, "past")]);
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">My bookings</h1>
      <section>
        <h2 className="mb-2 font-semibold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing booked. <Link className="underline" href="/search">Find parking</Link></p>
        ) : (
          <ul className="space-y-2">{upcoming.map((r) => <BookingRow key={r.id} r={r} />)}</ul>
        )}
      </section>
      {past.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Past</h2>
          <ul className="space-y-2">{past.map((r) => <BookingRow key={r.id} r={r} />)}</ul>
        </section>
      )}
    </div>
  );
}
