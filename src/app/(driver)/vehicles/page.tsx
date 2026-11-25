import { requirePageRole } from "@/modules/auth/current-user";
import { listVehicles } from "@/modules/vehicles/service";
import { Section } from "@/components/ui/misc";
import { VehicleForm, VehicleList } from "@/components/vehicles/vehicles-manager";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const user = await requirePageRole("DRIVER");
  const vehicles = await listVehicles(user.id);
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">My vehicles</h1>
      <VehicleList vehicles={vehicles.map((v) => ({ id: v.id, plateNumber: v.plateNumber, type: v.type, make: v.make, model: v.model, color: v.color, isDefault: v.isDefault }))} />
      <Section title="Add a vehicle"><VehicleForm /></Section>
    </div>
  );
}
