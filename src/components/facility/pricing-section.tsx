"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, Section, Select } from "@/components/ui/misc";
import { api, ApiError, fromCents, toCents } from "@/lib/api-client";

interface RuleRow { name: string; vehicleType: string; firstUnit: string; additionalUnit: string; minimum: string; dailyCap: string; rounding: string }
interface ServerRule { name: string; vehicleType: string | null; firstUnitCents: number; additionalUnitCents: number; minimumChargeCents: number; dailyCapCents: number | null; rounding: string }

const blank: RuleRow = { name: "Standard", vehicleType: "", firstUnit: "30", additionalUnit: "25", minimum: "30", dailyCap: "", rounding: "UP_TO_HOUR" };

export function PricingSection({ facilityId, rules }: { facilityId: string; rules: ServerRule[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<RuleRow[]>(
    rules.length
      ? rules.map((r) => ({ name: r.name, vehicleType: r.vehicleType ?? "", firstUnit: fromCents(r.firstUnitCents), additionalUnit: fromCents(r.additionalUnitCents),
          minimum: fromCents(r.minimumChargeCents), dailyCap: r.dailyCapCents == null ? "" : fromCents(r.dailyCapCents), rounding: r.rounding }))
      : [blank],
  );
  const [msg, setMsg] = useState<{ err?: string; ok?: string }>({});
  const upd = (i: number, k: keyof RuleRow, v: string) => setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg({});
    try {
      await api(`/api/facilities/${facilityId}/pricing`, "PUT", rows.map((r) => ({
        name: r.name, vehicleType: r.vehicleType || null, unit: "HOURLY", firstUnitCents: toCents(r.firstUnit), additionalUnitCents: toCents(r.additionalUnit),
        minimumChargeCents: toCents(r.minimum || 0), dailyCapCents: r.dailyCap ? toCents(r.dailyCap) : null, rounding: r.rounding, active: true,
      })));
      setMsg({ ok: "Pricing saved." });
      router.refresh();
    } catch (x) {
      setMsg({ err: (x as ApiError).message });
    }
  }

  return (
    <Section title="Pricing" description="Amounts are in Ethiopian Birr (ETB). Rules apply per hour; a rule for a specific vehicle type overrides the general one.">
      <form onSubmit={save} className="space-y-4">
        {rows.map((r, i) => (
          <fieldset key={i} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium">Rule {i + 1}</legend>
            <Field id={`pn${i}`} label="Name"><Input id={`pn${i}`} value={r.name} onChange={(e) => upd(i, "name", e.target.value)} /></Field>
            <Field id={`pv${i}`} label="Vehicle type">
              <Select id={`pv${i}`} value={r.vehicleType} onChange={(e) => upd(i, "vehicleType", e.target.value)}>
                <option value="">All vehicles</option><option value="MOTORCYCLE">Motorcycle</option><option value="SEDAN">Sedan</option>
                <option value="SUV">SUV</option><option value="MINIBUS">Minibus</option><option value="TRUCK">Truck</option>
              </Select>
            </Field>
            <Field id={`pr${i}`} label="Rounding">
              <Select id={`pr${i}`} value={r.rounding} onChange={(e) => upd(i, "rounding", e.target.value)}>
                <option value="UP_TO_HOUR">Up to next hour</option><option value="UP_TO_30_MIN">Up to next 30 min</option>
                <option value="UP_TO_15_MIN">Up to next 15 min</option><option value="NONE">No rounding</option>
              </Select>
            </Field>
            <Field id={`pf${i}`} label="First hour (ETB)"><Input id={`pf${i}`} inputMode="decimal" value={r.firstUnit} onChange={(e) => upd(i, "firstUnit", e.target.value)} /></Field>
            <Field id={`pa${i}`} label="Each extra hour (ETB)"><Input id={`pa${i}`} inputMode="decimal" value={r.additionalUnit} onChange={(e) => upd(i, "additionalUnit", e.target.value)} /></Field>
            <Field id={`pm${i}`} label="Minimum charge (ETB)"><Input id={`pm${i}`} inputMode="decimal" value={r.minimum} onChange={(e) => upd(i, "minimum", e.target.value)} /></Field>
            <Field id={`pd${i}`} label="Daily cap (ETB, optional)"><Input id={`pd${i}`} inputMode="decimal" value={r.dailyCap} onChange={(e) => upd(i, "dailyCap", e.target.value)} /></Field>
            {rows.length > 1 && <Button type="button" variant="ghost" onClick={() => setRows((p) => p.filter((_, j) => j !== i))}>Remove rule</Button>}
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setRows((p) => [...p, { ...blank, name: `Rule ${p.length + 1}` }])}>Add rule</Button>
          <Button type="submit">Save pricing</Button>
        </div>
        <FormMessage error={msg.err} ok={msg.ok} />
      </form>
    </Section>
  );
}
