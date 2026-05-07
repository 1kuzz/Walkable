import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import Navbar from "@/components/ui/Navbar";

export const metadata: Metadata = {
  title: "Walkable — Walking Routes in Parks",
  description: "Discover, build and share walking routes in parks around you. Check weather and trail conditions.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Walkable" },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
