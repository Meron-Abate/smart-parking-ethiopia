"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Checkbox, FormMessage, Section, Select } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Space { id: string; label: string; status: "AVAILABLE" | "UNAVAILABLE" | "MAINTENANCE" }
interface Zone { id: string; name: string; spaces: Space[] }
interface Floor { id: string; name: string; level: number; zones: Zone[] }

const STATE_STYLE: Record<Space["status"], string> = {
  AVAILABLE: "border-emerald-700 bg-emerald-50",
  MAINTENANCE: "border-amber-700 bg-amber-50 line-through",
  UNAVAILABLE: "border-stone-500 bg-stone-200 line-through",
};

export function InventorySection({ facilityId, model, capacity, floors }: { facilityId: string; model: string; capacity: number; floors: Floor[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ err?: string; ok?: string }>({});
  const zones = floors.flatMap((f) => f.zones.map((z) => ({ ...z, floor: f.name })));

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      router.refresh();
    } catch (x) {
      setMsg({ err: (x as ApiError).message });
    }
  }
  const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

  if (model === "CAPACITY_BASED") {
    return (
      <Section title="Parking inventory" description="This facility tracks capacity only (no numbered spaces).">
        <p><strong>{capacity}</strong> vehicles. Change the number in the facility details above.</p>
      </Section>
    );
  }

  return (
    <Section title="Parking inventory" description={`${capacity} space${capacity === 1 ? "" : "s"} in ${floors.length} floor${floors.length === 1 ? "" : "s"}. Capacity always equals the number of spaces.`}>
      <div className="grid gap-6 lg:grid-cols-3">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget;
          run(() => api(`/api/facilities/${facilityId}/floors`, "POST", { name: val(f, "name"), level: Number(val(f, "level") || 0) }).then(() => form.reset()), "Floor added."); }}>
          <h3 className="font-medium">1. Add a floor</h3>
          <Field id="floorName" label="Name"><Input id="floorName" name="name" placeholder="Ground" required /></Field>
          <Field id="floorLevel" label="Level"><Input id="floorLevel" name="level" inputMode="numeric" defaultValue="0" /></Field>
          <Button type="submit" variant="outline">Add floor</Button>
        </form>

        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget;
          run(() => api(`/api/facilities/${facilityId}/zones`, "POST", { floorId: val(f, "floorId"), name: val(f, "name") }).then(() => form.reset()), "Zone added."); }}>
          <h3 className="font-medium">2. Add a zone</h3>
          <Field id="zoneFloor" label="Floor"><Select id="zoneFloor" name="floorId" required>{floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
          <Field id="zoneName" label="Zone name"><Input id="zoneName" name="name" placeholder="A" required /></Field>
          <Button type="submit" variant="outline" disabled={floors.length === 0}>Add zone</Button>
        </form>

        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
          run(() => api(`/api/facilities/${facilityId}/spaces`, "POST", {
            zoneId: val(f, "zoneId"), prefix: val(f, "prefix"), from: Number(val(f, "from") || 1), count: Number(val(f, "count")),
            isCovered: f.get("covered") === "on", vehicleTypes: ["MOTORCYCLE", "SEDAN", "SUV"].filter((t) => f.get(`vt_${t}`) === "on"),
          }), "Spaces added."); }}>
          <h3 className="font-medium">3. Add spaces</h3>
          <Field id="spZone" label="Zone"><Select id="spZone" name="zoneId" required>{zones.map((z) => <option key={z.id} value={z.id}>{z.floor} / {z.name}</option>)}</Select></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field id="spPrefix" label="Prefix"><Input id="spPrefix" name="prefix" placeholder="A" /></Field>
            <Field id="spFrom" label="From"><Input id="spFrom" name="from" inputMode="numeric" defaultValue="1" /></Field>
            <Field id="spCount" label="How many"><Input id="spCount" name="count" inputMode="numeric" defaultValue="10" required /></Field>
          </div>
          <fieldset className="flex flex-wrap gap-x-4">
            <legend className="text-sm font-medium">Vehicle types</legend>
            <Checkbox label="Motorcycle" name="vt_MOTORCYCLE" />
            <Checkbox label="Sedan" name="vt_SEDAN" defaultChecked />
            <Checkbox label="SUV" name="vt_SUV" defaultChecked />
          </fieldset>
          <Checkbox label="Covered" name="covered" />
          <Button type="submit" variant="outline" disabled={zones.length === 0}>Add spaces</Button>
        </form>
      </div>
      <div className="mt-3"><FormMessage error={msg.err} ok={msg.ok} /></div>

      <div className="mt-6 space-y-5" aria-label="Parking layout">
        {floors.map((f) => (
          <div key={f.id}>
            <h3 className="font-medium">{f.name} <span className="text-sm text-muted-foreground">(level {f.level})</span></h3>
            {f.zones.length === 0 && <p className="text-sm text-muted-foreground">No zones yet.</p>}
            {f.zones.map((z) => (
              <div key={z.id} className="mt-2">
                <p className="text-sm text-muted-foreground">Zone {z.name}: select a space to toggle maintenance</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {z.spaces.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        title={s.status}
                        aria-label={`Space ${s.label}, ${s.status.toLowerCase()}. Toggle maintenance.`}
                        className={cn("min-h-11 min-w-12 rounded border-2 px-2 text-sm", STATE_STYLE[s.status])}
                        onClick={() => run(() => api(`/api/parking-spaces/${s.id}`, "PATCH", { status: s.status === "AVAILABLE" ? "MAINTENANCE" : "AVAILABLE" }), `${s.label} updated.`)}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Reserved and occupied states appear here once bookings exist (Phase 4 and 6).</p>
      </div>
    </Section>
  );
}
