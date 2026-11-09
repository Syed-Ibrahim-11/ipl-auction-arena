"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";

const LINKS = [
  { href: "/auction", label: "Auction Room" },
  { href: "/players", label: "Players" },
  { href: "/teams", label: "Franchises" },
  { href: "/compare", label: "Compare" },
  { href: "/managers", label: "AI Managers" },
  { href: "/admin", label: "Admin" },
];

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/auction/")) return null;

  return (
    <footer className="mt-16 border-t border-line bg-bg2/60">
      <div className="container-page flex flex-col gap-5 py-7 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <p className="font-display text-sm font-bold uppercase tracking-[0.2em]">
            IPL Arena
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[0.78rem] text-muted transition-colors hover:text-accent2"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-[0.68rem] text-faint">© 2026 IPL Auction Arena</p>
      </div>
    </footer>
  );
}
