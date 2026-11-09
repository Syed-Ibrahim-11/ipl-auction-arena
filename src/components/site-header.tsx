"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, Search, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/auction", label: "Auction Room" },
  { href: "/players", label: "Players" },
  { href: "/teams", label: "Franchises" },
  { href: "/managers", label: "AI Managers" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-line/60 bg-bg/85 backdrop-blur-xl">
        <div className="container-page flex h-[68px] items-center justify-between gap-4">
          <BrandLogo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-[0.82rem] font-semibold transition-colors",
                    active ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-3.5 -bottom-[3px] h-[2px] rounded-full bg-accent" />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("arena:open-search"))}
              onPointerEnter={() => window.dispatchEvent(new Event("arena:prefetch-search"))}
              onFocus={() => window.dispatchEvent(new Event("arena:prefetch-search"))}
              aria-label="Search players, franchises and pages"
              className="hidden h-10 items-center gap-2 rounded-full border border-line bg-surface2 pl-3 pr-2 text-[0.78rem] font-semibold text-muted transition-colors hover:border-lineStrong hover:text-fg lg:inline-flex"
            >
              <Search size={15} aria-hidden="true" />
              Search
              <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 text-[0.56rem] font-semibold text-faint">
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("arena:open-search"))}
              onPointerEnter={() => window.dispatchEvent(new Event("arena:prefetch-search"))}
              onFocus={() => window.dispatchEvent(new Event("arena:prefetch-search"))}
              aria-label="Search players, franchises and pages"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface2 text-muted transition-colors hover:text-fg lg:hidden"
            >
              <Search size={17} aria-hidden="true" />
            </button>
            <ThemeToggle />
            <Link href="/auction" className="hidden sm:block">
              <span className="btn btn-primary btn-sm">
                Enter Auction Room
                <ArrowUpRight size={15} />
              </span>
            </Link>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface2 text-muted lg:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="border-b border-line bg-bg/97 backdrop-blur-xl lg:hidden">
          <nav className="container-page flex flex-col gap-1 py-4" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold",
                  pathname.startsWith(item.href)
                    ? "bg-accent/10 text-accent2"
                    : "text-muted hover:bg-surface2 hover:text-fg",
                )}
              >
                {item.label}
                <ArrowUpRight size={15} />
              </Link>
            ))}
            <Link href="/auction" onClick={() => setOpen(false)} className="btn btn-primary mt-2 w-full">
              Enter Auction Room
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
