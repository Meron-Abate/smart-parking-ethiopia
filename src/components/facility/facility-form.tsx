"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Checkbox, FormMessage, Select } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";

const TYPES = ["HOTEL", "MALL", "OFFICE", "COMMERCIAL", "RESTAURANT", "HOSPITAL", "UNIVERSITY", "PRIVATE_OPERATOR", "INDIVIDUAL"];
const FEATURES = ["CCTV", "SECURITY_GUARD", "LIGHTING", "EV_CHARGING", "CAR_WASH", "ATTENDANT"];
const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export interface FacilityFormValues {
  id?: string;
  name: string;
  description: string;
  type: string;
  address: string;
  subCity: string;
  neighborhood: string;
  latitude: string;
  longitude: string;
  contactPhone: string;
  contactEmail: string;
  inventoryModel: "INDIVIDUAL_SPACES" | "CAPACITY_BASED";
  totalCapacity: string;
  isCovered: boolean;
  isIndoor: boolean;
  is24Hours: boolean;
  features: string[];
}

export const emptyFacility: FacilityFormValues = {
  name: "", description: "", type: "COMMERCIAL", address: "", subCity: "", neighborhood: "", latitude: "", longitude: "",
  contactPhone: "", contactEmail: "", inventoryModel: "INDIVIDUAL_SPACES", totalCapacity: "0",
  isCovered: false, isIndoor: false, is24Hours: false, features: [],
};

export function FacilityForm({ initial = emptyFacility }: { initial?: FacilityFormValues }) {
  const router = useRouter();
  const editing = Boolean(initial.id);
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FacilityFormValues>(k: K, val: FacilityFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const fe = (k: string) => err?.field(k);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setSaved(false);
    const common = {
      name: v.name, description: v.description || undefined, type: v.type, address: v.address,
      subCity: v.subCity || undefined, neighborhood: v.neighborhood || undefined,
      latitude: Number(v.latitude), longitude: Number(v.longitude),
      contactPhone: v.contactPhone || undefined, contactEmail: v.contactEmail || undefined,
      isCovered: v.isCovered, isIndoor: v.isIndoor, is24Hours: v.is24Hours, features: v.features,
    };
    try {
      if (editing) {
        const capacity = v.inventoryModel === "CAPACITY_BASED" ? { totalCapacity: Number(v.totalCapacity) } : {};
        await api(`/api/facilities/${initial.id}`, "PATCH", { ...common, ...capacity });
        setSaved(true);
        router.refresh();
      } else {
        const created = await api<{ id: string }>("/api/facilities", "POST", {
          ...common, inventoryModel: v.inventoryModel, totalCapacity: v.inventoryModel === "CAPACITY_BASED" ? Number(v.totalCapacity) : 0,
        });
        router.push(`/facility/${created.id}`);
        router.refresh();
      }
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field id="name" label="Facility name" error={fe("name")}><Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} required /></Field>
      <Field id="type" label="Facility type" error={fe("type")}>
        <Select id="type" value={v.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
      </Field>
      <Field id="description" label="Description (optional)" error={fe("description")}><Input id="description" value={v.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field id="address" label="Address" error={fe("address")}><Input id="address" value={v.address} onChange={(e) => set("address", e.target.value)} required /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="subCity" label="Sub-city (optional)"><Input id="subCity" value={v.subCity} onChange={(e) => set("subCity", e.target.value)} /></Field>
        <Field id="neighborhood" label="Neighbourhood (optional)"><Input id="neighborhood" value={v.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="latitude" label="Latitude" error={fe("latitude")} hint="e.g. 9.0107 (Addis Ababa is about 9.0)">
          <Input id="latitude" inputMode="decimal" value={v.latitude} onChange={(e) => set("latitude", e.target.value)} required />
        </Field>
        <Field id="longitude" label="Longitude" error={fe("longitude")} hint="e.g. 38.7612 (Addis Ababa is about 38.7)">
          <Input id="longitude" inputMode="decimal" value={v.longitude} onChange={(e) => set("longitude", e.target.value)} required />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">Pick-on-map location selection arrives with the map integration in Phase 3. Until then enter coordinates (right-click a place in OpenStreetMap or Google Maps to copy them).</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="contactPhone" label="Contact phone (optional)"><Input id="contactPhone" type="tel" value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></Field>
        <Field id="contactEmail" label="Contact email (optional)" error={fe("contactEmail")}><Input id="contactEmail" type="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></Field>
      </div>

      <fieldset className="space-y-3 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-medium">Inventory</legend>
        <Field id="inventoryModel" label="How do you manage spaces?" hint={editing ? "Fixed after creation." : "Individual spaces lets drivers pick a numbered space. Capacity-based only tracks how many are free."}>
          <Select id="inventoryModel" value={v.inventoryModel} disabled={editing} onChange={(e) => set("inventoryModel", e.target.value as FacilityFormValues["inventoryModel"])}>
            <option value="INDIVIDUAL_SPACES">Individual numbered spaces</option>
            <option value="CAPACITY_BASED">Capacity only</option>
          </Select>
        </Field>
        {v.inventoryModel === "CAPACITY_BASED" && (
          <Field id="totalCapacity" label="Total capacity (vehicles)" error={fe("totalCapacity")}>
            <Input id="totalCapacity" inputMode="numeric" value={v.totalCapacity} onChange={(e) => set("totalCapacity", e.target.value)} />
          </Field>
        )}
      </fieldset>

      <fieldset className="grid gap-1 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">Characteristics</legend>
        <Checkbox label="Covered" checked={v.isCovered} onChange={(e) => set("isCovered", e.target.checked)} />
        <Checkbox label="Indoor" checked={v.isIndoor} onChange={(e) => set("isIndoor", e.target.checked)} />
        <Checkbox label="Open 24 hours" checked={v.is24Hours} onChange={(e) => set("is24Hours", e.target.checked)} />
      </fieldset>
      <fieldset className="grid gap-1 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">Services & security</legend>
        {FEATURES.map((f) => (
          <Checkbox key={f} label={label(f)} checked={v.features.includes(f)}
            onChange={(e) => set("features", e.target.checked ? [...v.features, f] : v.features.filter((x) => x !== f))} />
        ))}
      </fieldset>

      <FormMessage error={err ? (err.message === "Invalid input." ? "Please fix the highlighted fields." : err.message) : null} ok={saved ? "Saved." : null} />
      <Button type="submit" disabled={busy}>{editing ? "Save changes" : "Submit facility for review"}</Button>
    </form>
  );
}
