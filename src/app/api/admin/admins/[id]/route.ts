import { NextResponse } from "next/server";
import { MIN_PASSWORD, isAdminId, normaliseUsername } from "@/lib/admins";
import { normaliseRole } from "@/lib/roles";
import { guardOwner } from "@/lib/server/access";
import {
  countOwners,
  deleteAdmin,
  getAdmin,
  updateAdmin,
  usernameTaken,
} from "@/lib/server/adminsRepo";
import { getSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * One account.
 *
 * Two rules live here rather than in the screen, because a rule enforced only
 * by a form is not a rule:
 *
 *   the last owner cannot stop being one — demoting or deleting them would
 *   leave an admin nobody can grant access in, and the only way back is a shell
 *   and scripts/create-admin.mjs;
 *
 *   nobody deletes themselves — it is never what was meant, and the account
 *   doing it is by definition an owner, so it is the fastest way to the
 *   situation above.
 */

export async function PUT(request: Request, { params }: Params) {
  const denied = await guardOwner();
  if (denied) return denied;

  const { id } = await params;
  if (!isAdminId(id)) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { username, password } = body as { username?: unknown; password?: unknown };

  const name = normaliseUsername(username);
  if (!name) {
    return NextResponse.json({ error: "A username is required." }, { status: 400 });
  }

  // Blank means "leave the password alone". Anything typed has to clear the bar.
  const secret = typeof password === "string" ? password : "";
  if (secret && secret.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `The password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 }
    );
  }

  try {
    const existing = await getAdmin(id);
    if (!existing) {
      return NextResponse.json({ error: "No such account." }, { status: 404 });
    }

    if (await usernameTaken(name, id)) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }

    if (existing.role === "owner" && normaliseRole((body as { role?: unknown }).role) !== "owner") {
      if ((await countOwners()) <= 1) {
        return NextResponse.json(
          { error: "There has to be at least one owner." },
          { status: 409 }
        );
      }
    }

    const admin = await updateAdmin(id, { ...(body as object), username: name }, secret);
    if (!admin) {
      return NextResponse.json({ error: "No such account." }, { status: 404 });
    }

    return NextResponse.json({ admin });
  } catch (error) {
    console.error("[admin/admins] PUT", error);
    return NextResponse.json({ error: "Could not save the account." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await guardOwner();
  if (denied) return denied;

  const { id } = await params;
  if (!isAdminId(id)) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  const session = await getSession();
  if (session?.adminId === id) {
    return NextResponse.json(
      { error: "You cannot delete the account you are signed in as." },
      { status: 409 }
    );
  }

  try {
    const existing = await getAdmin(id);
    if (!existing) {
      return NextResponse.json({ error: "No such account." }, { status: 404 });
    }

    if (existing.role === "owner" && (await countOwners()) <= 1) {
      return NextResponse.json({ error: "There has to be at least one owner." }, { status: 409 });
    }

    await deleteAdmin(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/admins] DELETE", error);
    return NextResponse.json({ error: "Could not delete the account." }, { status: 500 });
  }
}
