"use client";

import { useState, type FormEvent } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirect: false,
    });

    setLoading(false);
    if (!result || result.error) {
      setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกระงับ");
      return;
    }

    const session = await getSession();
    router.push(session?.user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");
    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-mark">K</div>
        <div className="brand-copy">
          <span className="eyebrow">THANBURI COMMERCIAL COLLEGE</span>
          <h1>IT-KMS</h1>
          <p>ระบบบริหารจัดการกุญแจห้องปฏิบัติการ</p>
        </div>
        <div className="brand-foot">จัดการห้องและกุญแจได้ในที่เดียว</div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand">IT-KMS <span>•</span> วิทยาลัยพณิชยการธนบุรี</div>
          <div className="login-heading">
            <span className="eyebrow">ยินดีต้อนรับ</span>
            <h2>เข้าสู่ระบบ</h2>
            <p>กรอกบัญชีผู้ใช้เพื่อดำเนินการต่อ</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="username">ชื่อผู้ใช้หรืออีเมล</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="กรอกชื่อผู้ใช้หรืออีเมล"
              required
            />
            <label htmlFor="password">รหัสผ่าน</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="กรอกรหัสผ่าน"
              required
            />
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" disabled={loading}>
              {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="login-note">
            <span className="secure-icon" aria-hidden="true">✓</span>
            ระบบสำหรับบุคลากรและนักศึกษา วิทยาลัยพณิชยการธนบุรี
          </div>
        </div>
        <footer className="login-footer">IT Room Key Management System <span>·</span> © 2026</footer>
      </section>
    </main>
  );
}
