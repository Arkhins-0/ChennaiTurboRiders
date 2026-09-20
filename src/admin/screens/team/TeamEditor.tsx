"use client";

import { useState } from "react";
import type { AdminAccount } from "@/lib/admins";
import {
  GRANT_LABELS,
  GRANT_MODULES,
  ROLE_LABELS,
  type Grant,
  type GrantModule,
} from "@/lib/roles";
import type { Site } from "@/lib/sites";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { CheckIcon, UsersIcon } from "@/admin/ui/icons";
import { Hint, Note, Panel } from "@/admin/components/Fields";

/**
 * Who else works on this sport.
 *
 * The narrow half of the Accounts screen, handed to the person who runs one
 * sport. Everything about it is bounded by that:
 *
 *   ONE SPORT.  Every toggle writes a grant on this site and no other. An
 *               account's grants elsewhere are neither shown nor touched — a
 *               sport admin has no business knowing who runs pickleball.
 *   NO `*`.     `grantableModules` leaves it out, so a sport admin can hand out
 *               every piece of their own sport and cannot clone themselves. The
 *               only account that can make another sport admin is the owner,
 *               which is what keeps "who owns this sport" answerable.
 *   NO NEW ACCOUNTS. A new account is a new password and a new way in. Creating
 *               one stays on the Accounts screen, with the owner.
 *
 * Owners are listed but not editable: they already reach everything, and a row
 * of ticks that changes nothing is how somebody ends up believing it did.
 */
export function TeamEditor({
  site,
  initialAdmins,
  currentAdminId,
}: {
  site: Site;
  /** Every account. Owners are shown read-only; the rest are the roster. */
  initialAdmins: AdminAccount[];
  currentAdminId: string;
}) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Only the modules this sport actually has, plus the four every site has. */
  const offered: GrantModule[] = GRANT_MODULES.filter(
    (module) =>
      module !== "*" &&
      (module === "identity" ||
        module === "drivers" ||
        module === "sponsors" ||
        module === "team" ||
        (site.modules as readonly string[]).includes(module))
  );

  const grantsHere = (account: AdminAccount): Grant[] =>
    account.grants.filter((grant) => grant.siteId === site.id);

  const holds = (account: AdminAccount, module: GrantModule): boolean =>
    grantsHere(account).some((grant) => grant.module === module);

  /** `*` is not offered here, but an account the owner gave one still shows as full. */
  const isSportAdmin = (account: AdminAccount): boolean => holds(account, "*");

  async function toggle(account: AdminAccount, module: GrantModule) {
    if (busy) return;

    const on = holds(account, module);
    const next = on
      ? grantsHere(account).filter((grant) => grant.module !== module)
      : [...grantsHere(account), { siteId: site.id, siteSlug: site.slug, module }];

    setBusy(account.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/team?site=${encodeURIComponent(site.slug)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminId: account.id,
            modules: next.map((grant) => grant.module),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data?.error === "string" ? data.error : "That could not be saved.");
        return;
      }

      /*
       * Replace this account's grants ON THIS SITE only, from what the server
       * confirmed. Its grants elsewhere are not in the response and must not be
       * dropped — the route only ever writes one site's worth.
       */
      const confirmed: Grant[] = Array.isArray(data?.grants) ? data.grants : next;

      setAdmins((current) =>
        current.map((entry) =>
          entry.id === account.id
            ? {
                ...entry,
                grants: [
                  ...entry.grants.filter((grant) => grant.siteId !== site.id),
                  ...confirmed,
                ],
              }
            : entry
        )
      );
    } catch {
      setError("That could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  const roster = admins.filter((account) => account.role !== "owner");
  const owners = admins.filter((account) => account.role === "owner");

  return (
    <div className="flex min-h-0 flex-col gap-2 md:h-full">
      {/*
        A plain header rather than `EditorToolbar`.

        That component is built around a Save button and a dirty flag, and this
        screen has neither: each toggle writes immediately, because a grant is
        one boolean and batching a page of them behind a Save only creates a
        state where the screen and the database disagree.
      */}
      <header className="rounded-lg border border-border bg-card px-3 py-2.5">
        <h1 className="text-sm font-semibold text-foreground">{site.name} — co-admins</h1>
        <p className="text-xs text-muted-fg">Who can edit which parts of this sport</p>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto">
        {error ? (
          <Note className="rounded-md border border-destructive/40 px-2.5 py-2 text-destructive">
            {error}
          </Note>
        ) : null}

        <Panel title="Team" hint={`${roster.length} account${roster.length === 1 ? "" : "s"}`}>
          {roster.length === 0 ? (
            <Hint>
              No accounts yet. An owner creates them on the Accounts screen; once one exists it
              can be given a part of this sport here.
            </Hint>
          ) : (
            <div className="space-y-3">
              {roster.map((account) => {
                const full = isSportAdmin(account);

                return (
                  <div key={account.id} className="rounded-md border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <UsersIcon className="h-4 w-4 text-muted-fg" />
                      <span className="text-[13px] font-medium text-foreground">
                        {account.username}
                        {account.id === currentAdminId ? " (you)" : ""}
                      </span>
                      <span className="text-xs text-muted-fg">{ROLE_LABELS[account.role]}</span>
                    </div>

                    {full ? (
                      <Hint className="mt-2">
                        This account runs the whole sport. Only an owner can change that, from
                        Accounts.
                      </Hint>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {offered.map((module) => {
                          const on = holds(account, module);

                          return (
                            <Button
                              key={module}
                              variant={on ? "default" : "outline"}
                              size="sm"
                              disabled={busy === account.id}
                              onClick={() => toggle(account, module)}
                              aria-pressed={on}
                            >
                              {on ? <CheckIcon /> : null}
                              {GRANT_LABELS[module]}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {owners.length > 0 ? (
          <Panel title="Owners">
            <p className={cn("text-[13px] leading-relaxed text-muted-fg")}>
              {owners.map((account) => account.username).join(", ")} — every sport, including
              this one. Not editable here.
            </p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
