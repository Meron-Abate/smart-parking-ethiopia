import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePageRole } from "@/modules/auth/current-user";
import { listVehicles } from "@/modules/vehicles/service";
import { ReserveForm } from "@/components/booking/reserve-form";

const params = z.object({
  facilityId: z.string().min(1),
  startAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(15).max(10080),
  destName: z.string().max(120).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

export default async function ReservePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageRole("DRIVER");
  const p = params.safeParse(await searchParams);
  if (!p.success) redirect("/search");
  const vehicles = await listVehicles(user.id);
  const { facilityId, startAt, durationMinutes, destName, lat, lng } = p.data;
  return (
    <div className="space-y-4">
      <div>
        <Link href="/search" className="text-sm underline">&larr; Back to search</Link>
        <h1 className="mt-2 text-2xl font-semibold">Reserve parking</h1>
      </div>
      <ReserveForm
        facilityId={facilityId}
        startAt={startAt}
        durationMinutes={durationMinutes}
        destination={{ name: destName, latitude: lat, longitude: lng }}
        initialVehicles={vehicles.map((v) => ({ id: v.id, plateNumber: v.plateNumber, type: v.type, make: v.make, model: v.model, color: v.color, isDefault: v.isDefault }))}
      />
    </div>
  );
}
