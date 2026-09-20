import { requireOwner } from "@/lib/server/access";
import { listAdmins } from "@/lib/server/adminsRepo";
import { listSites } from "@/lib/server/sitesRepo";
import { AdminsEditor } from "@/admin/screens/admins/AdminsEditor";

export const dynamic = "force-dynamic";

export default async function AdminsAdminPage() {
  const session = await requireOwner();
  const [admins, sites] = await Promise.all([listAdmins(), listSites()]);

  return (
    <AdminsEditor initialAdmins={admins} sites={sites} currentAdminId={session.adminId} />
  );
}
