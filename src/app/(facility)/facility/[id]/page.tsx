import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/modules/auth/current-user";
import { approvalBlockers, getFacility } from "@/modules/facilities/service";
import { depositLimits } from "@/modules/settings/service";
import { AppError } from "@/platform/errors";
import { Section, StatusBadge } from "@/components/ui/misc";
import { FacilityForm, type FacilityFormValues } from "@/components/facility/facility-form";
import { InventorySection } from "@/components/facility/inventory-section";
import { PricingSection } from "@/components/facility/pricing-section";
import { HoursSection } from "@/components/facility/hours-section";
import { PoliciesSection } from "@/components/facility/policies-section";

export default async function FacilityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageRole("FACILITY_ADMIN", "SUPER_ADMIN");
  let f;
  try {
    f = await getFacility(user, id);
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound(); // do not reveal other tenants' ids
    throw e;
  }
  const [blockers, limits] = await Promise.all([approvalBlockers(id), depositLimits()]);

  const initial: FacilityFormValues = {
    id: f.id, name: f.name, description: f.description ?? "", type: f.type, address: f.address, subCity: f.subCity ?? "",
    neighborhood: f.neighborhood ?? "", latitude: String(f.latitude), longitude: String(f.longitude),
    contactPhone: f.contactPhone ?? "", contactEmail: f.contactEmail ?? "", inventoryModel: f.inventoryModel,
    totalCapacity: String(f.totalCapacity), isCovered: f.isCovered, isIndoor: f.isIndoor, is24Hours: f.is24Hours, features: f.features.map((x) => x.key),
  };
  const { facilityId: _a, ...reservation } = f.reservationPolicy!;
  const { facilityId: _b, ...cancellation } = f.cancellationPolicy!;
  const editable = f.status !== "SUSPENDED";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/facility" className="text-sm underline">&larr; My facilities</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{f.name}</h1>
          <StatusBadge status={f.status} />
        </div>
        <p className="text-sm text-muted-foreground">{f.organization.name}</p>
      </div>

      <Section title="Review status">
        {f.status === "PENDING_APPROVAL" && (
          <>
            <p>Waiting for platform review.</p>
            {blockers.length > 0 && (
              <>
                <p className="mt-2 text-sm font-medium">Complete these before it can be approved:</p>
                <ul className="list-disc pl-5 text-sm">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              </>
            )}
          </>
        )}
        {f.status === "APPROVED" && <p>Approved. Drivers will be able to discover this facility once destination search launches (Phase 3).</p>}
        {f.status === "REJECTED" && <p>Rejected: {f.rejectionReason}. Edit the details below and save to resubmit for review.</p>}
        {f.status === "SUSPENDED" && <p>Suspended by the platform{f.rejectionReason ? `: ${f.rejectionReason}` : ""}. Contact support to reinstate.</p>}
      </Section>

      {editable ? (
        <>
          <Section title="Facility details"><FacilityForm initial={initial} /></Section>
          <InventorySection facilityId={f.id} model={f.inventoryModel} capacity={f.totalCapacity} floors={f.floors} />
          <PricingSection facilityId={f.id} rules={f.pricingRules} />
          <HoursSection facilityId={f.id} is24Hours={f.is24Hours} hours={f.hours} />
          <PoliciesSection facilityId={f.id} limits={limits} reservation={reservation} cancellation={cancellation} />
        </>
      ) : (
        <p className="text-muted-foreground">Editing is disabled while the facility is suspended.</p>
      )}
    </div>
  );
}
