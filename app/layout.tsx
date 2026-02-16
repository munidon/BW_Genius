import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "🍙 흑과 백",
  description: "더 지니어스 흑과 백 1:1 게임",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
