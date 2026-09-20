"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SEO, SITE } from "@/config/site";
import { Button } from "@/admin/ui/Button";
import { Card, CardContent } from "@/admin/ui/Card";
import { Input, Label } from "@/admin/ui/Input";
import { ErrorNote } from "@/admin/components/Fields";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Sign in failed.");
        setBusy(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-16 font-ui text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={SEO.logo} alt={SITE.name} className="h-12 w-auto" />
          <div>
            <h1 className="text-lg font-medium tracking-tight text-foreground">{SITE.name} admin</h1>
            <p className="mt-0.5 text-xs text-muted-fg">Sign in to edit the landing page</p>
          </div>
        </div>

        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <Label>Username</Label>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                  autoFocus
                  className="mt-1.5"
                />
              </label>

              <label className="block">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="mt-1.5"
                />
              </label>

              {error ? <ErrorNote>{error}</ErrorNote> : null}

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-[11px] text-muted-fg/70">Authorised personnel only.</p>
      </div>
    </main>
  );
}
