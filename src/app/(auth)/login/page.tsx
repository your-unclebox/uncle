import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk · Uncle" };

// OWN-01 / ADM-01: login Owner & Admin (email + password).
export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-center text-sm font-semibold tracking-wide text-primary">UNCLE</p>
        <h1 className="mt-2 text-center text-2xl font-bold">Masuk ke dashboard</h1>
        <LoginForm />
      </div>
    </main>
  );
}
