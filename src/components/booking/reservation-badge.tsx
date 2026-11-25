import { RESERVATION_STATUS } from "@/lib/reservation-ui";

/** Status is always shown as text, never by colour alone. */
export function ReservationBadge({ status }: { status: string }) {
  const s = RESERVATION_STATUS[status] ?? { text: status, cls: "bg-stone-200 text-stone-800" };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.text}</span>;
}
