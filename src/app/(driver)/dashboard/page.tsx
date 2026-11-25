import Link from "next/link";
import { requirePageRole } from "@/modules/auth/current-user";
import { listMyReservations } from "@/modules/reservations/service";
import { ReservationBadge } from "@/components/booking/reservation-badge";
import { PhasePlaceholder } from "@/components/app-shell";
import { fmtAddis } from "@/lib/addis-time";

export const dynamic = "force-dynamic";

export default async function DriverDashboard() {
  const user = await requirePageRole("DRIVER");
  const upcoming = (await listMyReservations(user, "upcoming")).slice(0, 3);
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">My parking</h1>
        <p className="mt-1 text-muted-foreground">
          <Link className="underline" href="/search">Find parking</Link> near where you are going, then reserve it.
        </p>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming reservations.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((r) => (
              <li key={r.id}>
                <Link href={`/bookings/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4 hover:bg-muted">
                  <span><span className="font-medium">{r.facility.name}</span><span className="block text-sm text-muted-foreground">{fmtAddis(r.startAt.toISOString())}</span></span>
                  <ReservationBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <PhasePlaceholder title="Active parking and payments" phase="Phase 5 (payments) and Phase 6 (active parking)" />
    </div>
  );
}
