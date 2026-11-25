"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage, Select } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import { formatETB } from "@/platform/money";

export interface BookingActionsProps {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  holdExpiresAt: string | null;
  depositCents: number;
  refundIfCancelledNowCents: number;
  allowExtensions: boolean;
  pendingExtension: { id: string; additionalFeeCents: number; newEndAt: string; holdExpiresAt: string | null } | null;
  showSimulator: boolean;
}

function useCountdown(iso: string | null, onDone: () => void) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return setLeft(null);
    const tick = () => {
      const s = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) onDone();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);
  return left;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function BookingActions(p: BookingActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ err?: string; ok?: string }>({});
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [extra, setExtra] = useState("60");
  const refresh = () => router.refresh();
  const holdLeft = useCountdown(p.status === "PENDING_PAYMENT" ? p.holdExpiresAt : null, refresh);
  const extLeft = useCountdown(p.pendingExtension?.holdExpiresAt ?? null, refresh);

  async function run(path: string, body?: unknown, okText?: string) {
    setBusy(true);
    setMsg({});
    try {
      await api(path, "POST", body);
      setMsg({ ok: okText });
      setConfirmCancel(false);
      refresh();
    } catch (x) {
      setMsg({ err: (x as ApiError).message });
    } finally {
      setBusy(false);
    }
  }

  const base = `/api/reservations/${p.id}`;
  const live = p.status === "PENDING_PAYMENT" || p.status === "CONFIRMED";
  const canExtend = ["CONFIRMED", "CHECKED_IN", "ACTIVE"].includes(p.status) && p.allowExtensions && !p.pendingExtension;

  return (
    <div className="space-y-4">
      {p.status === "PENDING_PAYMENT" && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4" aria-live="polite">
          <p className="font-medium">Your space is held{holdLeft != null ? ` for ${mmss(holdLeft)}` : ""}.</p>
          <p className="mt-1 text-sm">Pay the {formatETB(p.depositCents)} deposit to confirm it. If time runs out, the space is released.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Real payment arrives in Phase 5. Shown disabled so it is never mistaken for a working feature. */}
            <Button type="button" disabled title="Online payment is built in Phase 5">Pay deposit (coming in Phase 5)</Button>
            {p.showSimulator && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => run(`${base}/simulate-payment`, undefined, "Simulated payment recorded.")}>
                Simulate payment (development only)
              </Button>
            )}
          </div>
          {p.showSimulator && <p className="mt-2 text-xs text-muted-foreground">The simulator only changes the booking status. No money moves.</p>}
        </section>
      )}

      {p.pendingExtension && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4" aria-live="polite">
          <p className="font-medium">Extension waiting for payment{extLeft != null ? ` (${mmss(extLeft)} left)` : ""}.</p>
          <p className="mt-1 text-sm">Extra {formatETB(p.pendingExtension.additionalFeeCents)}. If it is not paid in time your original end time is restored.</p>
          {p.showSimulator && (
            <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => run(`${base}/simulate-payment`, undefined, "Simulated extension payment recorded.")}>
              Simulate extension payment (development only)
            </Button>
          )}
        </section>
      )}

      {canExtend && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Need more time?</h2>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <label htmlFor="extra" className="text-sm font-medium">Extend by</label>
              <Select id="extra" value={extra} onChange={(e) => setExtra(e.target.value)}>
                {[30, 60, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
              </Select>
            </div>
            <Button type="button" variant="outline" disabled={busy} onClick={() => run(`${base}/extend`, { extraMinutes: Number(extra) }, "Extension requested. Pay to confirm it.")}>Request extension</Button>
          </div>
        </section>
      )}

      {live && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Cancel reservation</h2>
          {!confirmCancel ? (
            <Button type="button" variant="outline" className="mt-2" onClick={() => setConfirmCancel(true)}>Cancel this reservation</Button>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-sm">
                {p.status === "CONFIRMED"
                  ? `If you cancel now you will be refunded ${formatETB(p.refundIfCancelledNowCents)} of your ${formatETB(p.depositCents)} deposit.`
                  : "Nothing has been paid, so nothing is charged."}
              </p>
              <div className="flex gap-2">
                <Button type="button" disabled={busy} onClick={() => run(`${base}/cancel`, undefined, "Reservation cancelled.")}>Yes, cancel</Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmCancel(false)}>Keep it</Button>
              </div>
            </div>
          )}
        </section>
      )}
      <FormMessage error={msg.err} ok={msg.ok} />
    </div>
  );
}
