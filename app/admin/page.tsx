import type { Metadata } from "next";
import { UsersList } from "@/components/admin/users-list";
import { requireAdmin } from "@/lib/auth/access";
import { listUsersForAdmin } from "@/lib/platform/admin";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const users = await listUsersForAdmin();
  return <UsersList users={users} meId={me.id} />;
}
