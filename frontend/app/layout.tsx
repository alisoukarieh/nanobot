import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "nanobot",
  description: "nanobot dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
