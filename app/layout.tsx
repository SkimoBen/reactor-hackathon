import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HappyOyster",
  description:
    "Build a world from a prompt, then travel it live, WASD in Adventure, text in Directing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
