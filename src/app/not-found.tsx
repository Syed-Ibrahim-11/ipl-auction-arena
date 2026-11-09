import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Search, Trophy } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[70vh] items-center py-16">
      <div className="grid w-full gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
        <div>
          <p className="eyebrow">Error 404 · outside the boundary</p>
          <h1 className="mt-4 font-display text-[clamp(4rem,12vw,8rem)] font-bold uppercase leading-[0.82] tracking-[0.01em]">
            Gone
            <br />
            <span className="text-accent2">for six</span>
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
            This page is not in the auction pool. The link may be outdated, the player or franchise may not exist, or the
            auction session may have been removed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/auction" className="btn btn-primary">
              Auction lobby <ArrowUpRight size={15} />
            </Link>
            <Link href="/players" className="btn btn-outline">
              <Search size={15} /> Player explorer
            </Link>
            <Link href="/" className="btn btn-ghost">
              <ArrowLeft size={15} /> Home
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-6 rounded-[2rem] bg-accent/10 blur-3xl" aria-hidden="true" />
          <div className="surface-card relative overflow-hidden p-6">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <LogoMark size={30} />
                <span className="font-display text-xs font-bold uppercase tracking-[0.18em]">Auction board</span>
              </div>
              <span className="chip chip-danger">Lot unavailable</span>
            </div>
            <div className="py-8 text-center">
              <p className="num font-display text-6xl font-bold text-faint">—</p>
              <p className="mt-2 font-display text-2xl font-bold uppercase tracking-wide">No lot found</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                The auctioneer has moved on. Head back to a live room to keep bidding.
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-4 text-[0.65rem] uppercase tracking-[0.14em] text-faint">
              <span className="flex items-center gap-1.5">
                <Trophy size={12} /> IPL Auction Arena
              </span>
              <span>404 · not sold</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
