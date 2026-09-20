import { NextResponse } from "next/server";
import { getSql } from "@/lib/server/db";
import { createSession, pruneExpiredSessions, verifyPassword } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let username = "";
  let password = "";

  try {
    const body = await request.json();
    username = typeof body?.username === "string" ? body.username.trim() : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, password_hash FROM ctr.admins WHERE username = ${username}
    `) as { id: string; password_hash: string }[];

    const admin = rows[0];
    // The same message either way, so this cannot be used to enumerate accounts.
    if (!admin || !(await verifyPassword(password, admin.password_hash))) {
      return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    }

    await createSession(admin.id);
    await pruneExpiredSessions();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/login]", error);
    return NextResponse.json(
      { error: "Could not reach the database. Check DATABASE_URL, then run `npm run db:migrate`." },
      { status: 500 }
    );
  }
}
