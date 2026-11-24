import { FacilityForm } from "@/components/facility/facility-form";

export default function NewFacilityPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Register a facility</h1>
      <p className="text-sm text-muted-foreground">
        After you submit, add your spaces (or capacity), pricing and opening hours. A platform administrator reviews it before drivers can find it.
      </p>
      <FacilityForm />
    </div>
  );
}
