import Link from "next/link";
import { requirePageRole } from "@/modules/auth/current-user";
import { approvalBlockers, listFacilities } from "@/modules/facilities/service";
import { StatusBadge } from "@/components/ui/misc";
import { ReviewActions } from "@/components/admin/review-actions";

const FILTERS = [["PENDING_APPROVAL", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["SUSPENDED", "Suspended"]] as const;

export default async function AdminFacilities({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePageRole("SUPER_ADMIN");
  const sp = await searchParams;
  const status = FILTERS.find(([s]) => s === sp.status)?.[0] ?? "PENDING_APPROVAL";
  const { rows, meta } = await listFacilities(user, { status, page: 1, limit: 50 });
  const blockers = new Map(await Promise.all(rows.map(async (r) => [r.id, await approvalBlockers(r.id)] as const)));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Facilities</h1>
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map(([s, l]) => (
          <Link key={s} href={`/admin/facilities?status=${s}`} aria-current={s === status ? "page" : undefined}
            className={`min-h-11 rounded-md border px-3 py-2.5 text-sm ${s === status ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{l}</Link>
        ))}
      </nav>
      {rows.length === 0 && <p className="text-muted-foreground">No facilities in this state.</p>}
      <ul className="space-y-3">
        {rows.map((f) => (
          <li key={f.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{f.name}</p>
                <p className="text-sm text-muted-foreground">{f.organization.name} · {f.address} · {f.totalCapacity} spaces</p>
              </div>
              <StatusBadge status={f.status} />
            </div>
            {f.rejectionReason && <p className="mt-1 text-sm">Reason: {f.rejectionReason}</p>}
            {f.status === "PENDING_APPROVAL" && blockers.get(f.id)!.length > 0 && (
              <p className="mt-2 text-sm text-danger">Incomplete: {blockers.get(f.id)!.join("; ")}</p>
            )}
            <div className="mt-3"><ReviewActions facilityId={f.id} status={f.status} /></div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{meta.total} total</p>
    </div>
  );
}
