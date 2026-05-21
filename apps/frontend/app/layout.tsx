import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ovik Attendance",
  description: "Frontend for attendance monitoring and review."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
