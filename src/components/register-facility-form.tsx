"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";

export function RegisterFacilityForm() {
  const router = useRouter();
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/organizations", "POST", {
        organization: { name: v("orgName"), phone: v("orgPhone") || undefined, email: v("orgEmail") || undefined },
        admin: { fullName: v("fullName"), email: v("email") || undefined, phone: v("phone") || undefined, password: v("password") },
      });
      router.push("/facility/new");
      router.refresh();
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusy(false);
    }
  }
  const fe = (k: string) => err?.field(k);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-2xl font-semibold">List your parking</h1>
      <p className="text-sm text-muted-foreground">
        Create an operator account. Each parking facility you add is reviewed before drivers can see it.
      </p>
      <Field id="orgName" label="Organization name" error={fe("organization")}><Input id="orgName" name="orgName" required /></Field>
      <Field id="orgPhone" label="Organization phone (optional)"><Input id="orgPhone" name="orgPhone" type="tel" /></Field>
      <Field id="orgEmail" label="Organization email (optional)"><Input id="orgEmail" name="orgEmail" type="email" /></Field>
      <hr className="border-border" />
      <Field id="fullName" label="Your full name"><Input id="fullName" name="fullName" autoComplete="name" required /></Field>
      <Field id="email" label="Your email"><Input id="email" name="email" type="email" autoComplete="email" /></Field>
      <Field id="phone" label="Your phone (optional if email given)" hint="e.g. 0911 234 567"><Input id="phone" name="phone" type="tel" autoComplete="tel" /></Field>
      <Field id="password" label="Password" hint="At least 8 characters, with a letter and a digit." error={fe("admin")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage error={err?.message === "Invalid input." ? "Please check the highlighted fields." : err?.message} />
      <Button type="submit" className="w-full" disabled={busy}>Create operator account</Button>
      <p className="text-sm text-muted-foreground">
        Already registered? <Link className="underline" href="/login">Sign in</Link>
      </p>
    </form>
  );
}
