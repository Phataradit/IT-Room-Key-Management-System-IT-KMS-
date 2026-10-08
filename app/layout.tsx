import type { Metadata } from "next";
import "antd/dist/reset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "IT-KMS | ระบบบริหารจัดการกุญแจห้อง",
  description: "ระบบบริหารจัดการห้องและการยืม-คืนกุญแจ วิทยาลัยพณิชยการธนบุรี",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
