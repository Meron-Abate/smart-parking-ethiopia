export const RESERVATION_STATUS: Record<string, { text: string; cls: string }> = {
  PENDING_PAYMENT: { text: "Awaiting payment", cls: "bg-amber-100 text-amber-900" },
  CONFIRMED: { text: "Confirmed", cls: "bg-emerald-100 text-emerald-900" },
  CHECKED_IN: { text: "Checked in", cls: "bg-sky-100 text-sky-900" },
  ACTIVE: { text: "Parked", cls: "bg-sky-100 text-sky-900" },
  EXTENSION_PENDING: { text: "Extension pending", cls: "bg-amber-100 text-amber-900" },
  COMPLETED: { text: "Completed", cls: "bg-stone-200 text-stone-800" },
  CANCELLED: { text: "Cancelled", cls: "bg-stone-200 text-stone-800" },
  EXPIRED: { text: "Hold expired", cls: "bg-stone-200 text-stone-800" },
  NO_SHOW: { text: "No-show", cls: "bg-red-100 text-red-900" },
  REFUND_PENDING: { text: "Refund pending", cls: "bg-amber-100 text-amber-900" },
  REFUNDED: { text: "Refunded", cls: "bg-stone-200 text-stone-800" },
};
