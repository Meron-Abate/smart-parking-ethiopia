import * as React from "react";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-900",
  REJECTED: "bg-red-100 text-red-900",
  SUSPENDED: "bg-stone-200 text-stone-800",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Pending approval", APPROVED: "Approved", REJECTED: "Rejected", SUSPENDED: "Suspended",
};

/** Status is always conveyed by text, not colour alone. */
export const StatusBadge = ({ status }: { status: string }) => (
  <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>{STATUS_LABEL[status] ?? status}</span>
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn("w-full min-h-11 rounded-md border border-border bg-card px-3 text-base", className)} {...p} />
));
Select.displayName = "Select";

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Checkbox({ label, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" className="size-4" {...p} />
      {label}
    </label>
  );
}

export const FormMessage = ({ error, ok }: { error?: string | null; ok?: string | null }) =>
  error ? (
    <p role="alert" className="text-sm text-danger">{error}</p>
  ) : ok ? (
    <p role="status" className="text-sm text-primary">{ok}</p>
  ) : null;
