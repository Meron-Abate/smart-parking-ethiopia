"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { passwordSchema } from "@/modules/auth/schemas";
import { HOME_BY_ROLE } from "@/modules/rbac/policy";
import { t } from "@/i18n";

const loginForm = z.object({ identifier: z.string().min(3, "Enter your email or phone"), password: z.string().min(1, "Enter your password") });
const registerForm = z
  .object({ fullName: z.string().min(2, "Enter your name"), email: z.string().email("Enter a valid email").or(z.literal("")), phone: z.string(), password: passwordSchema })
  .refine((v) => v.email || v.phone, { message: "Provide an email or a phone number", path: ["email"] });

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = mode === "login" ? loginForm : registerForm;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({
    // react-hook-form's resolver generics don't line up with zod 4's inferred types for dynamic schemas.
    resolver: zodResolver(schema as never) as unknown as Resolver<Record<string, string>>,
  });

  async function onSubmit(values: Record<string, string>) {
    setServerError(null);
    const payload = mode === "register" ? { ...values, email: values.email || undefined, phone: values.phone || undefined } : values;
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error?.message ?? "Something went wrong.");
      return;
    }
    router.push(HOME_BY_ROLE[json.data.role as keyof typeof HOME_BY_ROLE]);
    router.refresh();
  }

  const e = (k: string) => errors[k]?.message as string | undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <h1 className="text-2xl font-semibold">{t(mode === "login" ? "auth.login.title" : "auth.register.title")}</h1>
      {mode === "register" ? (
        <>
          <Field id="fullName" label={t("auth.fullName")} error={e("fullName")}>
            <Input id="fullName" autoComplete="name" {...register("fullName")} />
          </Field>
          <Field id="email" label={t("auth.email")} error={e("email")}>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
          </Field>
          <Field id="phone" label={t("auth.phone")} error={e("phone")} hint="e.g. 0911 234 567">
            <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
          </Field>
        </>
      ) : (
        <Field id="identifier" label={t("auth.identifier")} error={e("identifier")}>
          <Input id="identifier" autoComplete="username" {...register("identifier")} />
        </Field>
      )}
      <Field id="password" label={t("auth.password")} error={e("password")}>
        <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} {...register("password")} />
      </Field>
      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {serverError}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {t(mode === "login" ? "auth.submit.login" : "auth.submit.register")}
      </Button>
      <p className="text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New here? <Link className="underline" href="/register">Create an account</Link>
          </>
        ) : (
          <>
            Already registered? <Link className="underline" href="/login">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
