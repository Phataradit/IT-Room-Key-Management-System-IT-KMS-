import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { authOptions } from "@/lib/auth/options";
import { LoginForm } from "./login-form";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  await connection();
  const query = await searchParams;
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect(session.user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");
  }

  const logoutStatus =
    query.logout === "success" ||
    query.logout === "error" ||
    query.logout === "verify-error"
      ? query.logout
      : null;

  return <LoginForm logoutStatus={logoutStatus} />;
}
