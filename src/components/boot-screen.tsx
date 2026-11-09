"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";

const TIPS = [
  "Right to Match is a decision sequence, not an automatic buy-back.",
  "A cricket over is six legal balls — never a decimal number.",
  "Bid increments change as the price crosses each slab.",
  "Ratings here use IPL evidence only. Auction price is kept separate.",
  "Squad limits apply to total players and overseas players.",
  "Overseas limits are enforced server-side before any purchase is recorded.",
];

export function BootScreen() {
  const [visible, setVisible] = useState(true);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 450 : 1650;
    const timer = window.setTimeout(() => setVisible(false), duration);
    const tipTimer = window.setInterval(
      () => setTipIndex((index) => (index + 1) % TIPS.length),
      reduce ? 350 : 750,
    );
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(tipTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden bg-bg px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(700px 380px at 50% 32%, rgba(255,122,26,.18), transparent 65%), repeating-linear-gradient(90deg, transparent 0 78px, rgba(255,255,255,.03) 78px 79px)",
        }}
      />
      <div className="relative flex flex-col items-center">
        <div className="animate-pop">
          <LogoMark size={92} />
        </div>
        <p className="mt-7 font-display text-[0.7rem] font-semibold uppercase tracking-[0.42em] text-muted">
          IPL Auction
        </p>
        <h1 className="font-display text-5xl font-bold uppercase tracking-[0.04em] text-fg">Arena</h1>
        <p className="mt-5 font-display text-xs font-semibold uppercase tracking-[0.24em] text-accent2">
          Preparing the auction room
        </p>
        <p className="mt-4 min-h-[2.6rem] max-w-md text-sm leading-relaxed text-muted">{TIPS[tipIndex]}</p>
        <div className="mt-6 h-1 w-56 overflow-hidden rounded-full bg-surface3">
          <div
            className="h-full rounded-full bg-accent"
            style={{ animation: "boot-progress 1.6s cubic-bezier(.3,.8,.3,1) forwards" }}
          />
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="mt-8 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-faint underline-offset-4 hover:text-fg hover:underline"
        >
          Skip intro
        </button>
      </div>
      <style>{`@keyframes boot-progress { from { width: 4%; } to { width: 100%; } }`}</style>
    </div>
  );
}
