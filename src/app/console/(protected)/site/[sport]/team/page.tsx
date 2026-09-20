import { requireTeam } from "@/lib/server/access";
import { listAdmins } from "@/lib/server/adminsRepo";
import { TeamEditor } from "@/admin/screens/team/TeamEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sport: string }> };

/**
 * Who else works on this sport.
 *
 * The narrow half of the Accounts screen, handed to the person who runs one
 * sport rather than the owner. What it can do is bounded twice over:
 *
 *   it lists only accounts that already exist — creating one is still the
 *   owner's, because a new account is a new password and a new way in;
 *
 *   it grants only modules OF THIS SPORT, and never `*`. A sport admin can hand
 *   out every piece of their own sport and cannot clone themselves, which is
 *   what keeps "who owns this sport" answerable.
 *
 * `grantableModules` in src/lib/roles.ts is where both of those live, and the
 * route behind this screen asks it again.
 */
export default async function TeamAdminPage({ params }: Props) {
  const { sport } = await params;
  const { session, site } = await requireTeam(sport);

  const admins = await listAdmins();

  return (
    <TeamEditor
      site={site}
      initialAdmins={admins}
      currentAdminId={session.adminId}
    />
  );
}
