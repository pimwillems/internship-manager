import { redirect } from "next/navigation";

import { ensureCoordinatorSeeded } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Internship Coordination" };

export default async function LoginPage() {
  // Create the coordinator account from env on first ever load.
  await ensureCoordinatorSeeded();

  const session = await getSession();
  if (session) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">Internship Coordination</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sign in to manage students, assessors and capacity.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
