"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, Select } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";

const TYPES = ["MOTORCYCLE", "SEDAN", "SUV", "MINIBUS", "TRUCK"];
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export interface VehicleRow {
  id: string;
  plateNumber: string;
  type: string;
  make: string | null;
  model: string | null;
  color: string | null;
  isDefault: boolean;
}

/** Add form. `onAdded` lets the reserve page use it inline; by default it just refreshes the server data. */
export function VehicleForm({ onAdded }: { onAdded?: (v: VehicleRow) => void }) {
  const router = useRouter();
  const [v, setV] = useState({ plateNumber: "", type: "SEDAN", make: "", model: "", color: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const created = await api<VehicleRow>("/api/vehicles", "POST", { ...v, make: v.make || undefined, model: v.model || undefined, color: v.color || undefined });
      setV({ plateNumber: "", type: "SEDAN", make: "", model: "", color: "" });
      onAdded?.(created);
      router.refresh();
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="plate" label="Plate number" error={err?.field("plateNumber")} hint="Letters and digits, e.g. AA 12345">
          <Input id="plate" value={v.plateNumber} onChange={(e) => setV({ ...v, plateNumber: e.target.value })} required />
        </Field>
        <Field id="vtype" label="Vehicle type">
          <Select id="vtype" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
        </Field>
        <Field id="make" label="Make (optional)"><Input id="make" value={v.make} onChange={(e) => setV({ ...v, make: e.target.value })} /></Field>
        <Field id="vmodel" label="Model (optional)"><Input id="vmodel" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} /></Field>
      </div>
      <Button type="submit" disabled={busy}>Add vehicle</Button>
      <FormMessage error={err && !err.field("plateNumber") ? err.message : null} />
    </form>
  );
}

export function VehicleList({ vehicles }: { vehicles: VehicleRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function remove(id: string) {
    setError(null);
    try {
      await api(`/api/vehicles/${id}`, "DELETE");
      router.refresh();
    } catch (x) {
      setError((x as ApiError).message);
    }
  }
  if (vehicles.length === 0) return <p className="text-sm text-muted-foreground">No vehicles yet. Add one to make a reservation.</p>;
  return (
    <>
      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {vehicles.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium">{v.plateNumber}{v.isDefault && <span className="ml-2 text-xs text-muted-foreground">(default)</span>}</p>
              <p className="text-sm text-muted-foreground">{[label(v.type), v.make, v.model].filter(Boolean).join(" · ")}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => remove(v.id)} aria-label={`Remove ${v.plateNumber}`}>Remove</Button>
          </li>
        ))}
      </ul>
      <FormMessage error={error} />
    </>
  );
}
