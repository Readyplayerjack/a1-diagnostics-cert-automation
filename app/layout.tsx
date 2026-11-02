import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { themeCss } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: brand.strings.siteTitle,
  description: brand.strings.metaDescription,
  applicationName: brand.name,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <head>
        <style>{themeCss(brand.colors)}</style>
      </head>
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
