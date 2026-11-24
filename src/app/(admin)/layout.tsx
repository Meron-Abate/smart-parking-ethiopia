import { AppShell, type NavItem } from "@/components/app-shell";
import { requirePageRole } from "@/modules/auth/current-user";

const nav: NavItem[] = [
  { label: "Overview", href: "/admin", ready: true },
  { label: "Facility approvals", href: "#", ready: false, phase: "Phase 2" },
  { label: "Users", href: "#", ready: false, phase: "Phase 7" },
  { label: "Transactions", href: "#", ready: false, phase: "Phase 5" },
  { label: "Settings", href: "#", ready: false, phase: "Phase 7" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole("SUPER_ADMIN");
  return <AppShell area="Platform admin" user={user} nav={nav}>{children}</AppShell>;
}
