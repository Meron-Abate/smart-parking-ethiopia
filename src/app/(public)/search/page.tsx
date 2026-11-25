import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/modules/auth/current-user";
import { HOME_BY_ROLE } from "@/modules/rbac/policy";
import { SearchClient } from "@/components/discovery/search-client";
import { defaultArrival } from "@/modules/discovery/service";
import { t } from "@/i18n";

export const metadata = { title: "Find parking · Smart Parking Ethiopia" };
export const dynamic = "force-dynamic"; // the default arrival time depends on "now"

export default async function SearchPage() {
  const user = await getCurrentUser();
  const defaultArrivalIso = defaultArrival(new Date()).toISOString();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between p-4">
        <Link href="/" className="font-semibold">{t("brand")}</Link>
        <nav className="flex gap-3 text-sm">
          {user ? (
            <Link className="underline" href={HOME_BY_ROLE[user.role]}>Dashboard</Link>
          ) : (
            <>
              <Link className="underline" href="/login">{t("nav.login")}</Link>
              <Link className="underline" href="/register">{t("nav.register")}</Link>
            </>
          )}
        </nav>
      </header>
      <main>
        <h1 className="sr-only">Find parking near your destination</h1>
        <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
          <SearchClient defaultArrivalIso={defaultArrivalIso} role={user?.role ?? null} />
        </Suspense>
      </main>
    </div>
  );
}
