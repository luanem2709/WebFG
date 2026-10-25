import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";

export async function guardAdmin() {
  const admin = await requireAdminSession();
  if (!admin) redirect("/admin/login");
  return admin;
}
