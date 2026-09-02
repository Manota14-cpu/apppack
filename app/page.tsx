import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin-auth";

export default async function RootPage() {
  redirect((await isAdminAuthed()) ? "/dashboard" : "/login");
}
