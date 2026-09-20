"use client";

import { MIN_PASSWORD, type AdminAccount } from "@/lib/admins";
import {
  ADMIN_ROLES,
  GRANT_LABELS,
  GRANT_MODULES,
  ROLE_HINTS,
  ROLE_LABELS,
  type Grant,
  type GrantModule,
} from "@/lib/roles";
import type { Site } from "@/lib/sites";
import { cn } from "@/lib/utils";
import { Button } from "@/admin/ui/Button";
import { Input, Label, Select } from "@/admin/ui/Input";
import { CheckIcon, TrashIcon } from "@/admin/ui/icons";
import { Field, Hint, Note, Panel } from "@/admin/components/Fields";

/**
 * One account's record.
 *
 * The grant grid appears only for a `member`, because for an owner it decides
 * nothing — they have every sport already — and showing a list of ticks that
 * changes nothing is how an admin ends up believing it did.
 *
 * ── The grid, and why it is a grid ────────────────────────────────────────
 *
 * A scope is a pair now: which sport, and which part of it. That is two
 * dimensions, so it is drawn as two — a row per sport, a button per module —
 * rather than as one flat list of "INCRC decks, INCRC articles, Pickle
 * articles" that nobody can scan.
 *
 * `Everything` is the first button in each row and it is the sport-admin grant.
 * Ticking it is what makes somebody the person that sport belongs to, and it
 * greys the rest because they would all be redundant: `*` already covers every
 * module, including ones switched on later.
 *
 * The password field is blank on an account that already exists, and blank
 * means "leave it alone" rather than "clear it" — there is no such thing as an
 * account with no password. Typing one is the only way to change it, and doing
 * so signs that person out everywhere, which the note says out loud because it
 * is a surprising thing to happen to someone else while they are working.
 */
export function AdminForm({
  account,
  sites,
  password,
  isNew,
  isSelf,
  onChange,
  onPassword,
  onDelete,
  busy,
}: {
  account: AdminAccount;
  /** Every sport, so the grid has a row per one. */
  sites: Site[];
  /** Held by the editor, not on the record — it is never read back. */
  password: string;
  isNew: boolean;
  /** The account doing the editing. It cannot delete itself. */
  isSelf: boolean;
  onChange: (next: AdminAccount) => void;
  onPassword: (value: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const set = (patch: Partial<AdminAccount>) => onChange({ ...account, ...patch });

  const holds = (siteId: string, module: GrantModule): boolean =>
    account.grants.some((grant) => grant.siteId === siteId && grant.module === module);

  /**
   * Adds or removes one (sport, module) pair.
   *
   * Ticking `*` drops that sport's other grants rather than keeping them
   * alongside: they are all implied, and leaving them would mean unticking `*`
   * later silently left a scope behind that nobody chose.
   */
  function toggle(site: Site, module: GrantModule) {
    const on = holds(site.id, module);
    const others = account.grants.filter((grant) => grant.siteId !== site.id);
    const mine = account.grants.filter(
      (grant) => grant.siteId === site.id && grant.module !== module
    );

    const next: Grant[] = on
      ? [...others, ...mine]
      : module === "*"
        ? [...others, { siteId: site.id, siteSlug: site.slug, module: "*" }]
        : [
            ...others,
            ...mine.filter((grant) => grant.module !== "*"),
            { siteId: site.id, siteSlug: site.slug, module },
          ];

    set({ grants: next });
  }

  /**
   * Adds or removes one capability. No sport to key it by — that is the point.
   *
   * Rebuilt from `CAPABILITIES` rather than appended to, so the list is always
   * in the same order the server returns it in. The editor's dirty check
   * compares these as JSON, and an order that depended on which button was
   * pressed first would show unsaved changes on a set that had not changed.
   */

  /** A module is only offered where the sport has it switched on. */
  const modulesFor = (site: Site): GrantModule[] =>
    GRANT_MODULES.filter(
      (module) =>
        module === "*" ||
        module === "identity" ||
        module === "drivers" ||
        module === "sponsors" ||
        module === "team" ||
        (site.modules as readonly string[]).includes(module)
    );

  return (
    <>
      <Panel title="Account">
        <div className="space-y-3">
          <Field
            label="Username"
            value={account.username}
            onChange={(username) => set({ username })}
            maxLength={60}
            placeholder="kavin"
            hint="What they type to sign in. Lower case, no spaces."
          />

          <label className="block">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(event) => onPassword(event.target.value)}
              autoComplete="new-password"
              placeholder={isNew ? `At least ${MIN_PASSWORD} characters` : "Leave blank to keep it"}
              className="mt-1.5"
            />
            <Hint className="mt-1">
              {isNew
                ? `At least ${MIN_PASSWORD} characters. There is no reset by email, so write it down somewhere safe.`
                : "Blank leaves the password as it is. Changing it signs this account out everywhere."}
            </Hint>
          </label>
        </div>
      </Panel>

      <Panel title="Access">
        <div className="space-y-3">
          <div className="block">
            <Label>Role</Label>
            <Select
              value={account.role}
              onChange={(event) =>
                set({ role: event.target.value as AdminAccount["role"] })
              }
              className="mt-1.5 w-full"
            >
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
            <Hint className="mt-1">{ROLE_HINTS[account.role]}</Hint>
          </div>

          {account.role === "member" ? (
            <div className="block">
              <Label>What they can reach</Label>
              <div className="mt-1.5 space-y-2.5">
                {sites.map((site) => {
                  const everything = holds(site.id, "*");

                  return (
                    <div key={site.id}>
                      <p className="text-xs font-medium text-muted-fg">{site.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {modulesFor(site).map((module) => {
                          const on = module === "*" ? everything : holds(site.id, module);
                          // Every other button is implied by `*`, so it is shown
                          // as on and refuses to be changed while `*` is set.
                          const implied = everything && module !== "*";

                          return (
                            <Button
                              key={module}
                              variant={on || implied ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggle(site, module)}
                              disabled={implied}
                              aria-pressed={on || implied}
                            >
                              {on || implied ? <CheckIcon /> : null}
                              {GRANT_LABELS[module]}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Hint className="mt-1">
                “Everything on this sport” makes them its admin: every screen it has, and the
                right to hand pieces of it to co-admins. Anything narrower opens only what is
                ticked.
              </Hint>
            </div>
          ) : null}

          {account.role === "owner" ? (
            <Note>
              An owner can edit every page, build forms, read entries, and make or remove
              accounts — including this one.
            </Note>
          ) : null}
        </div>
      </Panel>

      <div className={cn("flex", isNew && "hidden")}>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={busy || isSelf}
          title={isSelf ? "You cannot delete the account you are signed in as." : undefined}
        >
          <TrashIcon />
          Delete account
        </Button>
      </div>
    </>
  );
}
