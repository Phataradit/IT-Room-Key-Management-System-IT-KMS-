"use client";

import { LogoutOutlined } from "@ant-design/icons";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await signOut({ redirect: false, callbackUrl: "/login" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="sign-out-button" aria-label="ออกจากระบบ" onClick={handleSignOut}>
      <LogoutOutlined />
    </button>
  );
}
