import Link from "next/link";
import { requirePageRole } from "@/modules/auth/current-user";
import { listFacilities } from "@/modules/facilities/service";
import { StatusBadge } from "@/components/ui/misc";

export default async function FacilityHome() {
  const user = await requirePageRole("FACILITY_ADMIN", "SUPER_ADMIN");
  const { rows } = await listFacilities(user, { page: 1, limit: 50 });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My facilities</h1>
        <Link href="/facility/new" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Add facility
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">You have not registered a facility yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((f) => (
            <li key={f.id}>
              <Link href={`/facility/${f.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted">
                <span>
                  <span className="block font-medium">{f.name}</span>
                  <span className="block text-sm text-muted-foreground">{f.address} · {f.totalCapacity} spaces</span>
                </span>
                <StatusBadge status={f.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
