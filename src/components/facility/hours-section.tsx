"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Checkbox, FormMessage, Section } from "@/components/ui/misc";
import { api, ApiError, minutesToTime, timeToMinutes } from "@/lib/api-client";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
interface Row { open: boolean; from: string; to: string }

export function HoursSection({ facilityId, is24Hours, hours }: { facilityId: string; is24Hours: boolean; hours: { dayOfWeek: number; opensMinute: number; closesMinute: number }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    DAYS.map((_, d) => {
      const h = hours.find((x) => x.dayOfWeek === d);
      return h ? { open: true, from: minutesToTime(h.opensMinute), to: minutesToTime(h.closesMinute) } : { open: false, from: "08:00", to: "20:00" };
    }),
  );
  const [msg, setMsg] = useState<{ err?: string; ok?: string }>({});
  const upd = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg({});
    try {
      await api(`/api/facilities/${facilityId}/hours`, "PUT",
        rows.flatMap((r, d) => (r.open ? [{ dayOfWeek: d, opensMinute: timeToMinutes(r.from), closesMinute: timeToMinutes(r.to, true) }] : [])));
      setMsg({ ok: "Opening hours saved." });
      router.refresh();
    } catch (x) {
      setMsg({ err: (x as ApiError).message === "Invalid input." ? "Closing time must be after opening time." : (x as ApiError).message });
    }
  }

  return (
    <Section title="Opening hours" description={is24Hours ? "This facility is marked open 24 hours, so these hours are not used." : "Local time (Africa/Addis_Ababa). Unticked days are closed."}>
      <form onSubmit={save} className="space-y-2">
        {DAYS.map((d, i) => (
          <div key={d} className="grid grid-cols-[8rem_1fr_1fr] items-center gap-2">
            <Checkbox label={d} checked={rows[i]!.open} onChange={(e) => upd(i, { open: e.target.checked })} />
            <Input type="time" aria-label={`${d} opens`} disabled={!rows[i]!.open} value={rows[i]!.from} onChange={(e) => upd(i, { from: e.target.value })} />
            <Input type="time" aria-label={`${d} closes`} disabled={!rows[i]!.open} value={rows[i]!.to} onChange={(e) => upd(i, { to: e.target.value })} />
          </div>
        ))}
        <Button type="submit">Save hours</Button>
        <FormMessage error={msg.err} ok={msg.ok} />
      </form>
    </Section>
  );
}
