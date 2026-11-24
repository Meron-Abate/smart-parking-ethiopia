import Link from "next/link";
import { getCurrentUser } from "@/modules/auth/current-user";
import { HOME_BY_ROLE } from "@/modules/rbac/policy";
import { t } from "@/i18n";

export default async function HomePage() {
  const user = await getCurrentUser();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between p-4">
        <span className="font-semibold">{t("brand")}</span>
        <nav className="flex gap-3 text-sm">
          {user ? (
            <Link className="underline" href={HOME_BY_ROLE[user.role]}>Dashboard</Link>
          ) : (
            <>
              <Link className="underline" href="/login">{t("nav.login")}</Link>
              <Link className="underline" href="/register">{t("nav.register")}</Link>
              <Link className="underline" href="/register-facility">List your parking</Link>
            </>
          )}
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-16">
        <h1 className="text-3xl font-semibold md:text-4xl">{t("home.headline")}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{t("home.sub")}</p>
        {/* Destination-first entry point. Wired to geocoding + PostGIS discovery in Phase 3. */}
        <div className="mt-8">
          <label htmlFor="destination" className="text-sm font-medium">{t("home.search.label")}</label>
          <input
            id="destination"
            disabled
            aria-describedby="destination-note"
            placeholder={t("home.search.placeholder")}
            className="mt-1.5 w-full min-h-12 rounded-md border border-border bg-muted px-3 text-base"
          />
          <p id="destination-note" className="mt-2 text-sm text-muted-foreground">{t("home.search.pending")}</p>
        </div>
      </main>
    </div>
  );
}
