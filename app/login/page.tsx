import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { LoginForm } from "./login-form";

export const instant = false;

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect(session.user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");
  }

  return <LoginForm />;
}
