"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SEO, SITE } from "@/config/site";
import { Button } from "@/admin/ui/Button";
import { Input, Label } from "@/admin/ui/Input";
import { ErrorNote } from "@/admin/components/Fields";
import { ArticlesIcon, DriversIcon, SeasonsIcon } from "@/admin/ui/icons";

const WHAT = [
  { Icon: DriversIcon, title: "The team", body: "Drivers, sponsors and the team's own pages." },
  { Icon: SeasonsIcon, title: "The racing", body: "Seasons in the Indian Racing League and Indian F4, round by round." },
  { Icon: ArticlesIcon, title: "The news", body: "Articles, race reports and the media library." },
];

/**
 * The sign-in page, as a workspace's: what the console is on the left on a
 * laptop, the form in a card on the right.
 */
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

  const brand = (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SEO.logo}
        alt=""
        width={32}
        height={32}
        className="size-8 rounded-lg bg-[#0a0a0a] object-contain p-0.5"
      />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold">CTR Console</span>
        <span className="block text-[11px] text-faint">{SITE.name}</span>
      </span>
    </div>
  );

  return (
    <main data-console className="flex min-h-screen bg-background font-ui text-[14px] text-foreground">
      <section className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-border bg-rail p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 75% 30%, rgb(var(--c-primary) / 0.12), transparent 70%), radial-gradient(40% 35% at 15% 10%, rgb(var(--c-primary-deep) / 0.07), transparent 70%)",
          }}
        />
        <div className="relative">{brand}</div>
        <div className="relative max-w-md">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">The team's console</p>
          <h2 className="mt-2 text-4xl font-semibold leading-tight tracking-tight">
            Everything the site says about the team, in one place.
          </h2>
          <div className="mt-8 space-y-4">
            {WHAT.map(({ Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary shadow-sm">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-[13px] text-faint">{body}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-faint">Authorised team staff only.</p>
      </section>

      <section className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 lg:hidden">{brand}</div>

        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-card">
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mb-5 mt-1 text-[13px] text-faint">With the account an owner made for you.</p>

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
        </div>

        <p className="mt-6 text-center text-xs text-faint lg:hidden">Authorised team staff only.</p>
      </section>
    </main>
  );
}
