"use client";

import { LogoutOutlined } from "@ant-design/icons";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button className="sign-out-button" aria-label="ออกจากระบบ" onClick={() => signOut({ callbackUrl: "/login" })}>
      <LogoutOutlined />
    </button>
  );
}
