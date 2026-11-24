import { AppShell, type NavItem } from "@/components/app-shell";
import { requirePageRole } from "@/modules/auth/current-user";

const nav: NavItem[] = [
  { label: "Overview", href: "/dashboard", ready: true },
  { label: "Search parking", href: "/", ready: false, phase: "Phase 3" },
  { label: "My bookings", href: "/bookings", ready: false, phase: "Phase 4" },
  { label: "Active parking", href: "/active", ready: false, phase: "Phase 6" },
  { label: "My vehicles", href: "/vehicles", ready: false, phase: "Phase 4" },
  { label: "Payments", href: "/payments", ready: false, phase: "Phase 5" },
  { label: "Notifications", href: "/notifications", ready: false, phase: "Phase 8" },
];

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole("DRIVER");
  return <AppShell area="Driver" user={user} nav={nav}>{children}</AppShell>;
}
