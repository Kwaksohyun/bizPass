import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cafe24 App",
  description: "카페24 앱 OAuth · shops 저장 스타터",
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
