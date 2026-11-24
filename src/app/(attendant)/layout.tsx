import { AppShell, type NavItem } from "@/components/app-shell";
import { requirePageRole } from "@/modules/auth/current-user";

const nav: NavItem[] = [
  { label: "Today", href: "/attendant", ready: true },
  { label: "Scan QR", href: "#", ready: false, phase: "Phase 6" },
  { label: "Booking lookup", href: "#", ready: false, phase: "Phase 6" },
  { label: "Current sessions", href: "#", ready: false, phase: "Phase 6" },
];

export default async function AttendantLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole("ATTENDANT", "FACILITY_ADMIN", "SUPER_ADMIN");
  return <AppShell area="Attendant" user={user} nav={nav}>{children}</AppShell>;
}
