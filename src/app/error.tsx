"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, ArrowUpRight, RotateCcw } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error", error);
  }, [error]);

  return (
    <div className="container-page flex min-h-[70vh] items-center py-16">
      <div className="mx-auto w-full max-w-2xl text-center">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
          <AlertTriangle size={28} />
        </div>
        <p className="eyebrow mt-5">Unexpected interruption</p>
        <h1 className="mt-3 font-display text-[clamp(2.6rem,7vw,4.6rem)] font-bold uppercase leading-[0.9]">
          The feed
          <br />
          <span className="text-accent2">dropped</span>
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-muted">
          Something failed while loading this screen. Nothing is lost if your auction was already saved — reopen the room
          to load its last committed state. If this keeps happening, the data quality dashboard can help narrow it down.
        </p>
        {error.digest && (
          <p className="mt-4 inline-block rounded-lg border border-line bg-surface2 px-3 py-1.5 font-mono text-[0.65rem] text-faint">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">
            <RotateCcw size={15} /> Try again
          </button>
          <Link href="/auction" className="btn btn-outline">
            Auction lobby <ArrowUpRight size={15} />
          </Link>
          <Link href="/" className="btn btn-ghost">
            <ArrowLeft size={15} /> Home
          </Link>
        </div>
        <div className="mt-10 flex items-center justify-center gap-2 text-[0.65rem] uppercase tracking-[0.16em] text-faint">
          <LogoMark size={22} />
          IPL Auction Arena · independent simulator
        </div>
      </div>
    </div>
  );
}
