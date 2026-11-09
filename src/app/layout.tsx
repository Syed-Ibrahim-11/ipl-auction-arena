import type { Metadata, Viewport } from "next";
import { BootScreen } from "@/components/boot-screen";
import { GlobalSearch } from "@/components/global-search";
import { RulesDock } from "@/components/rules-dock";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "IPL Auction Arena · Build your ultimate IPL squad",
    template: "%s · IPL Auction Arena",
  },
  description:
    "Experience realistic IPL auctions, analyse genuine player performances, manage your franchise budget and use AI-powered cricket insights to build a balanced squad.",
  applicationName: "IPL Auction Arena",
  keywords: [
    "IPL auction",
    "cricket simulator",
    "player ratings",
    "IPL 2026",
    "cricket analytics",
    "Right to Match",
  ],
  authors: [{ name: "IPL Auction Arena" }],
  openGraph: {
    type: "website",
    siteName: "IPL Auction Arena",
    title: "IPL Auction Arena · Build your ultimate IPL squad",
    description:
      "Realistic IPL auctions, verified player statistics, explainable ratings and a full season simulator.",
    url: siteUrl,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "IPL Auction Arena",
    description:
      "Build your ultimate IPL squad with realistic auctions, real statistics and a full season simulator.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Auction Arena",
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070b12" },
    { media: "(prefers-color-scheme: light)", color: "#f4f0e5" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <ThemeScript />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <RulesDock />
        <GlobalSearch />
        <BootScreen />
      </body>
    </html>
  );
}
