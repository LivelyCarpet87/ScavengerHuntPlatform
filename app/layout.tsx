import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { ServiceWorkerRegistrar } from "@/components/pwa/sw-register";
import { SkipLink } from "@/components/ui/skip-link";
import { Toaster } from "@/components/ui/toast";
import { env } from "@/lib/env";
import "./globals.css";

// One family, used expressively through its width axis: 62% for race-bib
// numerals, 75% for headings, 100% for reading. Only the latin file is
// preloaded; latin-ext (Łódź, Çağlar…) stays in the CSS with its
// unicode-range and downloads the first time a name needs it.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: env.appName, template: `%s – ${env.appName}` },
  description:
    "Run scavenger hunts: teams join with a code, submit photo proof from their phones, and watch the live scoreboard.",
  applicationName: env.appName,
  appleWebApp: { capable: true, title: env.appName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1215" },
  ],
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the big screen's pre-paint script sets data-theme on <html> (one level deep only).
    <html lang="en" className={`${archivo.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <SkipLink />
        <OfflineBanner />
        {children}
        <Toaster />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
