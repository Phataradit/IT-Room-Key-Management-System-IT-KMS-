"use client";

import { LoadingOutlined, LogoutOutlined } from "@ant-design/icons";
import { signOut } from "next-auth/react";
import { useState } from "react";

export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setError("");
    let sessionRevoked = false;

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(`Session revocation failed (${response.status})`);
      }
      sessionRevoked = true;

      const result = await signOut({
        redirect: false,
        callbackUrl: "/login?logout=success",
      });
      if (!result?.url) {
        throw new Error("NextAuth did not return a logout redirect");
      }

      window.location.replace(result.url);
    } catch (logoutError) {
      console.error("[auth] Logout failed:", logoutError);
      if (sessionRevoked) {
        window.location.replace("/login?logout=error");
        return;
      }
      setError("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
      setIsSigningOut(false);
    }
  }

  return (
    <div className="sign-out-control">
      <button
        className="sign-out-button"
        type="button"
        aria-label={isSigningOut ? "กำลังออกจากระบบ" : "ออกจากระบบ"}
        aria-busy={isSigningOut}
        disabled={isSigningOut}
        onClick={handleSignOut}
      >
        {isSigningOut ? <LoadingOutlined spin /> : <LogoutOutlined />}
        <span>{isSigningOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}</span>
      </button>
      {error && <span className="sign-out-error" role="alert">{error}</span>}
    </div>
  );
}
