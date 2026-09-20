import { NextResponse } from "next/server";
import { MIN_PASSWORD, normaliseUsername } from "@/lib/admins";
import { guardOwner } from "@/lib/server/access";
import { createAdmin, listAdmins, usernameTaken } from "@/lib/server/adminsRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The accounts.
 *
 * Owners only, both ways round: reading the list tells you who can edit what,
 * which is not a page editor's business, and writing it is how access is
 * granted in the first place.
 *
 * No PATCH here — accounts have no order to set.
 */

export async function GET() {
  const denied = await guardOwner();
  if (denied) return denied;

  try {
    return NextResponse.json({ admins: await listAdmins() });
  } catch (error) {
    console.error("[admin/admins] GET", error);
    return NextResponse.json({ error: "Could not load the accounts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await guardOwner();
  if (denied) return denied;

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

  // Length is the whole rule — see the note on MIN_PASSWORD.
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `The password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 }
    );
  }

  try {
    // Checked here as well as by the unique index, so the answer is a sentence
    // rather than a 500 with a constraint name in it.
    if (await usernameTaken(name)) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }

    const admin = await createAdmin({ ...(body as object), username: name }, password);
    return NextResponse.json({ admin });
  } catch (error) {
    console.error("[admin/admins] POST", error);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
