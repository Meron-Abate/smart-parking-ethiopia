"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Checkbox, FormMessage, Section } from "@/components/ui/misc";
import { api, ApiError, fromCents, toCents } from "@/lib/api-client";

interface Props {
  facilityId: string;
  limits: { min: number; max: number };
  reservation: Record<string, number | boolean>;
  cancellation: Record<string, number | boolean>;
}

export function PoliciesSection({ facilityId, limits, reservation, cancellation }: Props) {
  const router = useRouter();
  const [r, setR] = useState(() => Object.fromEntries(Object.entries(reservation).map(([k, v]) => [k, String(v)])));
  const [c, setC] = useState<Record<string, string>>(() => ({ ...Object.fromEntries(Object.entries(cancellation).map(([k, v]) => [k, String(v)])), noShowFee: fromCents(Number(cancellation.noShowFeeCents)) }));
  const [msg, setMsg] = useState<{ err?: string; ok?: string }>({});
  const n = (s: string | undefined) => Number(s ?? 0);
  const b = (s: string | undefined) => s === "true";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg({});
    try {
      await api(`/api/facilities/${facilityId}/policies`, "PUT", {
        reservation: {
          depositPercent: n(r.depositPercent), graceMinutes: n(r.graceMinutes), minAdvanceMinutes: n(r.minAdvanceMinutes), maxAdvanceDays: n(r.maxAdvanceDays),
          minDurationMinutes: n(r.minDurationMinutes), maxDurationMinutes: n(r.maxDurationMinutes), allowExtensions: b(r.allowExtensions),
          allowGraceExtension: b(r.allowGraceExtension), depositRefundableOnEarlyExit: b(r.depositRefundableOnEarlyExit), extensionGraceMinutes: n(r.extensionGraceMinutes),
        },
        cancellation: {
          freeCancelBeforeMinutes: n(c.freeCancelBeforeMinutes), refundPercentBefore: n(c.refundPercentBefore), refundPercentAfter: n(c.refundPercentAfter),
          noShowFeeCents: toCents(c.noShowFee ?? "0"), forfeitDepositOnNoShow: b(c.forfeitDepositOnNoShow),
        },
      });
      setMsg({ ok: "Policies saved." });
      router.refresh();
    } catch (x) {
      setMsg({ err: (x as ApiError).message });
    }
  }
  const sr = (k: string) => ({ value: r[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setR((p) => ({ ...p, [k]: e.target.value })) });
  const sc = (k: string) => ({ value: c[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setC((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <Section title="Booking and cancellation policies" description="Shown to drivers before they pay.">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="dep" label="Deposit (% of estimated fee)" hint={`Platform allows ${limits.min}% to ${limits.max}%.`}><Input id="dep" inputMode="numeric" {...sr("depositPercent")} /></Field>
          <Field id="grace" label="Grace period (minutes)"><Input id="grace" inputMode="numeric" {...sr("graceMinutes")} /></Field>
          <Field id="egrace" label="Extension grace (minutes)"><Input id="egrace" inputMode="numeric" {...sr("extensionGraceMinutes")} /></Field>
          <Field id="minadv" label="Earliest booking before arrival (min)" hint="0 = immediate booking allowed"><Input id="minadv" inputMode="numeric" {...sr("minAdvanceMinutes")} /></Field>
          <Field id="maxadv" label="Latest booking ahead (days)"><Input id="maxadv" inputMode="numeric" {...sr("maxAdvanceDays")} /></Field>
          <span />
          <Field id="mind" label="Minimum stay (minutes)"><Input id="mind" inputMode="numeric" {...sr("minDurationMinutes")} /></Field>
          <Field id="maxd" label="Maximum stay (minutes)"><Input id="maxd" inputMode="numeric" {...sr("maxDurationMinutes")} /></Field>
        </div>
        <div className="grid gap-1 sm:grid-cols-3">
          <Checkbox label="Allow extensions" checked={b(r.allowExtensions)} onChange={(e) => setR((p) => ({ ...p, allowExtensions: String(e.target.checked) }))} />
          <Checkbox label="Allow late-arrival extension" checked={b(r.allowGraceExtension)} onChange={(e) => setR((p) => ({ ...p, allowGraceExtension: String(e.target.checked) }))} />
          <Checkbox label="Refund unused deposit on early exit" checked={b(r.depositRefundableOnEarlyExit)} onChange={(e) => setR((p) => ({ ...p, depositRefundableOnEarlyExit: String(e.target.checked) }))} />
        </div>
        <h3 className="font-medium">Cancellation</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="free" label="Free cancellation until (min before arrival)"><Input id="free" inputMode="numeric" {...sc("freeCancelBeforeMinutes")} /></Field>
          <Field id="rb" label="Refund before deadline (%)"><Input id="rb" inputMode="numeric" {...sc("refundPercentBefore")} /></Field>
          <Field id="ra" label="Refund after deadline (%)"><Input id="ra" inputMode="numeric" {...sc("refundPercentAfter")} /></Field>
          <Field id="ns" label="No-show fee (ETB)"><Input id="ns" inputMode="decimal" {...sc("noShowFee")} /></Field>
        </div>
        <Checkbox label="Keep the deposit when the driver does not show up" checked={b(c.forfeitDepositOnNoShow)} onChange={(e) => setC((p) => ({ ...p, forfeitDepositOnNoShow: String(e.target.checked) }))} />
        <Button type="submit">Save policies</Button>
        <FormMessage error={msg.err} ok={msg.ok} />
      </form>
    </Section>
  );
}
