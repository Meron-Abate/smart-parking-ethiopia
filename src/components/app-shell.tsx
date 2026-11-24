import Link from "next/link";
import type { PublicUser } from "@/modules/auth/service";
import { LogoutButton } from "./logout-button";
import { t } from "@/i18n";

export interface NavItem {
  label: string;
  href: string;
  /** false = planned section; rendered as inert text, never a dead link. */
  ready: boolean;
  phase?: string;
}

export function AppShell({
  area,
  user,
  nav,
  children,
}: {
  area: string;
  user: PublicUser;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b border-border bg-card p-4 md:border-b-0 md:border-r">
        <p className="font-semibold">{t("brand")}</p>
        <p className="text-sm text-muted-foreground">{area}</p>
        <nav aria-label={`${area} navigation`} className="mt-4">
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {nav.map((n) => (
              <li key={n.label} className="shrink-0">
                {n.ready ? (
                  <Link href={n.href} className="block rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                    {n.label}
                  </Link>
                ) : (
                  <span className="block px-3 py-2.5 text-sm text-muted-foreground" aria-disabled="true">
                    {n.label}
                    {n.phase && <span className="ml-1 text-xs">({n.phase})</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div>
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <span className="text-sm text-muted-foreground">{user.fullName ?? user.email ?? user.phone}</span>
          <LogoutButton />
        </header>
        <main className="mx-auto max-w-5xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PhasePlaceholder({ title, phase }: { title: string; phase: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{t("phase.placeholder", { phase })}</p>
    </section>
  );
}
