"use client";

import { useState } from "react";
import { BLANK_ADMIN, describeAccess, type AdminAccount } from "@/lib/admins";
import type { Site } from "@/lib/sites";
import { ROLE_LABELS } from "@/lib/roles";
import { Button } from "@/admin/ui/Button";
import { PlusIcon, UsersIcon } from "@/admin/ui/icons";
import { AdminRailSlot } from "@/admin/components/AdminShell";
import { EditorToolbar } from "@/admin/components/EditorToolbar";
import { Note } from "@/admin/components/Fields";
import { SectionRail, type RailItem } from "@/admin/components/SectionRail";
import { AdminForm } from "./AdminForm";

/**
 * Who can sign in, and what each of them may touch.
 *
 * The same three-column screen as the circuits, with the middle column missing:
 * an account has nothing to preview. What is left is the rail of accounts and
 * the record of the open one, so the shape is still learnable from the other
 * editors even though it is doing something quite different.
 *
 * The rail does not drag. Accounts have no order — there is no `sort_order` on
 * the table and nothing on the site reads them in sequence — so they are listed
 * by name, and a handle that rearranged nothing would be a lie.
 *
 * A new account is a DRAFT held here rather than an empty row written
 * immediately, because creating one needs a password and a half-made account
 * with no password is not a thing the database should ever hold. It exists only
 * in this component until Save.
 */

/** The id the draft answers to. Not a real id — see above. */
const DRAFT = "";

export function AdminsEditor({
  initialAdmins,
  sites,
  currentAdminId,
}: {
  initialAdmins: AdminAccount[];
  /** Every sport, for the grant grid and for naming a grant in the rail. */
  sites: Site[];
  /** Whose session this is. They cannot delete themselves. */
  currentAdminId: string;
}) {
  // id → name, so `describeAccess` can print "INCRC: articles" rather than a uuid.
  const siteNames = Object.fromEntries(sites.map((site) => [site.id, site.name]));
  const [admins, setAdmins] = useState<AdminAccount[]>(initialAdmins);
  const [saved, setSaved] = useState<AdminAccount[]>(initialAdmins);

  const [draft, setDraft] = useState<AdminAccount | null>(null);
  const [password, setPassword] = useState("");

  const [activeId, setActiveId] = useState<string | null>(initialAdmins[0]?.id ?? null);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isDraft = activeId === DRAFT && draft !== null;
  const active = isDraft ? draft : (admins.find((admin) => admin.id === activeId) ?? null);
  const activeSaved = saved.find((admin) => admin.id === activeId) ?? null;

  const dirty = isDraft
    ? true
    : Boolean(
        active &&
          activeSaved &&
          (active.username !== activeSaved.username ||
            active.role !== activeSaved.role ||
            JSON.stringify(active.grants) !== JSON.stringify(activeSaved.grants) ||
            // Compared the same way, and it can be: `normaliseCapabilities`
            // returns them in a fixed order, so two equal sets stringify equal.
            password.length > 0)
      );

  /* ─────────────────────────── Writes ─────────────────────────── */

  async function handleSave() {
    if (!active) return;

    setBusy(true);
    setError(null);

    const creating = isDraft;
    const url = creating ? "/api/admin/admins" : `/api/admin/admins/${active.id}`;

    try {
      const response = await fetch(url, {
        method: creating ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...active, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not save this account.");
        return;
      }

      const admin = data.admin as AdminAccount;

      if (creating) {
        setAdmins((current) => [...current, admin].sort(byUsername));
        setSaved((current) => [...current, admin].sort(byUsername));
        setDraft(null);
        setActiveId(admin.id);
      } else {
        setAdmins((current) => current.map((a) => (a.id === admin.id ? admin : a)).sort(byUsername));
        setSaved((current) => current.map((a) => (a.id === admin.id ? admin : a)).sort(byUsername));
      }

      setPassword("");
      setJustSaved(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleAdd() {
    setDraft({ ...BLANK_ADMIN, id: DRAFT, created_at: "" });
    setPassword("");
    setActiveId(DRAFT);
    setJustSaved(false);
    setError(null);
  }

  async function handleDelete() {
    if (!active || isDraft) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/admins/${active.id}`, { method: "DELETE" });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not delete this account.");
        return;
      }

      const gone = active.id;
      const remaining = admins.filter((admin) => admin.id !== gone);
      const position = admins.findIndex((admin) => admin.id === gone);

      setActiveId(remaining[Math.min(position, remaining.length - 1)]?.id ?? null);
      setAdmins(remaining);
      setSaved((current) => current.filter((admin) => admin.id !== gone));
      setConfirmingDelete(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function update(next: AdminAccount) {
    if (isDraft) setDraft(next);
    else setAdmins((current) => current.map((a) => (a.id === next.id ? next : a)));
    setJustSaved(false);
  }

  /* ─────────────────────────── Screen ─────────────────────────── */

  const railItems: RailItem<string>[] = [
    ...admins.map((admin) => ({
      id: admin.id,
      short: admin.username || "Unnamed",
      title: admin.username || "Unnamed",
      hint: `${ROLE_LABELS[admin.role]} · ${describeAccess(admin, siteNames)}`,
      Icon: UsersIcon,
    })),
    ...(draft ? [{ id: DRAFT, short: "New account", hint: "Not saved yet", Icon: UsersIcon }] : []),
  ];

  return (
    <div className="flex min-h-0 flex-col gap-2 md:h-full">
      <AdminRailSlot>
        <SectionRail
          heading="Accounts"
          items={railItems}
          active={activeId ?? ""}
          onSelect={setActiveId}
        />
      </AdminRailSlot>

      <EditorToolbar
        Icon={UsersIcon}
        title={active ? active.username || "New account" : "Accounts"}
        hint={
          active
            ? "Who can sign in, and which screens open for them."
            : "No accounts yet — add the first one."
        }
        dirty={dirty}
        justSaved={justSaved}
        busy={busy}
        error={error}
        onSave={handleSave}
        actions={
          <Button variant="outline" size="sm" onClick={handleAdd} disabled={busy || draft !== null}>
            <PlusIcon />
            Add account
          </Button>
        }
        fieldsOpen={fieldsOpen}
        onToggleFields={() => setFieldsOpen((open) => !open)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card">
        {/* One column, capped: a record of four fields stretched across a wide
            screen is harder to read than the same record in a column. */}
        <div className="mx-auto max-w-2xl space-y-2.5 bg-background/40 p-3">
          {active ? (
            confirmingDelete ? (
              <div className="space-y-2.5 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-xs leading-relaxed text-foreground">
                  Delete <span className="font-medium">{active.username || "this account"}</span>?
                  They are signed out at once and cannot sign in again.
                </p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
                    {busy ? "Deleting…" : "Delete account"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={busy}
                  >
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <AdminForm
                  sites={sites}
                  account={active}
                  password={password}
                  isNew={isDraft}
                  isSelf={active.id === currentAdminId}
                  onChange={update}
                  onPassword={(value) => {
                    setPassword(value);
                    setJustSaved(false);
                  }}
                  onDelete={() => setConfirmingDelete(true)}
                  busy={busy}
                />

                <Note>
                  There is no password reset by email. If somebody is locked out, set a new
                  password here — or run{" "}
                  <span className="text-foreground">npm run create-admin</span> on the server,
                  which does the same thing.
                </Note>
              </>
            )
          ) : (
            <p className="rounded-md border border-dashed border-input px-4 py-10 text-center text-xs text-muted-fg">
              No accounts yet. Use <span className="text-foreground">Add account</span> above to
              make the first one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function byUsername(a: AdminAccount, b: AdminAccount): number {
  return a.username.localeCompare(b.username);
}
