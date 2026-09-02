import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin-auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await isAdminAuthed()) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-black text-lg font-bold shadow-sm">
            A
          </div>
          <span className="text-[22px] font-bold tracking-tight">AppPack</span>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
