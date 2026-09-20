import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { LoginForm } from "@/admin/screens/login/LoginForm";

export const metadata: Metadata = {
  title: "Sign In · CTR Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in: the console's root. On the admin host that is "/",
  // which the middleware maps to the mount point — never "/admin", which is
  // not a route on any host.
  if (await getSession()) {
    redirect("/");
  }

  return <LoginForm />;
}
