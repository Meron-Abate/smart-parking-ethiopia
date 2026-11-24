import { AppShell, type NavItem } from "@/components/app-shell";
import { requirePageRole } from "@/modules/auth/current-user";

const nav: NavItem[] = [
  { label: "Overview", href: "/facility", ready: true },
  { label: "Inventory", href: "#", ready: false, phase: "Phase 2" },
  { label: "Reservations", href: "#", ready: false, phase: "Phase 4" },
  { label: "Active sessions", href: "#", ready: false, phase: "Phase 6" },
  { label: "Staff", href: "#", ready: false, phase: "Phase 7" },
  { label: "Pricing", href: "#", ready: false, phase: "Phase 2" },
  { label: "Reports", href: "#", ready: false, phase: "Phase 7" },
];

export default async function FacilityLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole("FACILITY_ADMIN", "SUPER_ADMIN");
  return <AppShell area="Facility management" user={user} nav={nav}>{children}</AppShell>;
}
