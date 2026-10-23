import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SLPCC63 | Tools for Square teams",
  description: "Starter app scaffold for the hosted SLPCC63 | Tools for Square teams product."
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
