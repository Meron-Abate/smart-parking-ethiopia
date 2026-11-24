import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-sm p-6 pt-16">
      <AuthForm mode="register" />
    </main>
  );
}
