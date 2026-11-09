"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, X } from "lucide-react";
import { RULEBOOK_2026, RTM_PROCEDURE_2025, validBidSlabsLabel } from "@/lib/rules";
import { formatLakh } from "@/lib/money";
import { cn } from "@/lib/cn";

type Step = { title: string; detail: string };
type Section = { title: string; items: string[]; steps?: Step[] };
type RuleContent = {
  subtitle: string;
  facts?: Array<{ label: string; value: string }>;
  sections: Section[];
  note?: string;
};

const AUCTION_RULES: RuleContent = {
  subtitle: "Purse, squad limits, bidding and RTM",
  facts: [
    { label: "Squad", value: "18–25" },
    { label: "Overseas", value: "Max 8" },
    { label: "2026 purse", value: formatLakh(RULEBOOK_2026.purseCapLakh) },
    { label: "RTM cards", value: "6 per team" },
  ],
  sections: [
    {
      title: "Formats",
      items: [
        "2026 Open Mega Draft — every franchise starts empty, RTM optional before the first lot.",
        "2027 Mini Auction — retain your 2026 core at existing contract value, then bid with the balance.",
      ],
    },
    {
      title: "Bidding",
      items: [validBidSlabsLabel(RULEBOOK_2026), "The bid button always offers the next valid amount."],
    },
  ],
  note: "A squad must reach 18 players. Purse spent beyond the cap is never allowed.",
};

const RTM_SECTION: Section = {
  title: "Right to Match",
  items: [],
  steps: RTM_PROCEDURE_2025.map((step) => ({ title: step.title, detail: step.detail })),
};

const SEASON_RULES: RuleContent = {
  subtitle: "Match day, line-ups and readiness",
  facts: [
    { label: "Playing XI", value: "11" },
    { label: "Overseas in XI", value: "Max 4" },
    { label: "Ready window", value: "100 sec" },
    { label: "Auto-pick", value: "On timeout" },
  ],
  sections: [
    {
      title: "Starting a match",
      items: [
        "Against an AI franchise you can simulate straight away — no waiting for a ready flag.",
        "Against another manager both sides must ready up. If either side is not ready within 100 seconds, the match starts automatically.",
        "When the timer expires, the AI picks the toss, XI, bowlers, batters and batting order for anyone who missed it.",
      ],
    },
    {
      title: "Team strength",
      items: [
        "XI OVR is the role-constrained average of the selected eleven.",
        "Only players in your squad can be picked; overseas and role limits are checked before the toss.",
      ],
    },
    {
      title: "Simulating ahead",
      items: [
        "AI-only fixtures run matchday by matchday and stop before the next human fixture.",
        "Sim matchday plays every AI game on the next scheduled date, then pauses.",
        "Finish league and Finish season need every manager to agree; each vote is recorded until the room is unanimous.",
        "Once agreed, simulation still follows fixture date order and stops at any human match it reaches.",
      ],
    },
  ],
};

const PLAYER_RULES: RuleContent = {
  subtitle: "How OVR and discipline grades are built",
  facts: [
    { label: "Evidence", value: "To 2026" },
    { label: "OVR scale", value: "0–100" },
    { label: "Prices", value: "Not an input" },
    { label: "Model", value: "Simulator" },
  ],
  sections: [
    {
      title: "Rating inputs",
      items: [
        "Career IPL evidence through the 2026 season; no later matches are used.",
        "Recent-form window: 2025–2026, carrying 15–22% of each discipline grade.",
        "A listed all-rounder whose two disciplines differ by 10+ points is graded as the specialist he is.",
        "Peer percentiles use players with at least 300 balls faced, 300 balls bowled or 10 fielding matches.",
        "Small samples are shrunk toward the league median with a reliability factor.",
      ],
    },
    {
      title: "What does not count",
      items: ["Auction base prices and winning bids are not inputs to any rating."],
    },
  ],
  note: "Ratings are a simulator model, not an official ICC/IPL rating.",
};

const TEAM_RULES: RuleContent = {
  subtitle: "Roster, strength and auction context",
  sections: [
    {
      title: "Roster",
      items: [
        "The roster lists players with 2026 IPL appearances, ordered by analytical rating.",
        "Squad OVR is the mean of rated players; Best XI OVR is a role-constrained eleven.",
      ],
    },
    {
      title: "Auction buys",
      items: [
        "Purchase prices come from the supplied 2026 sold-player list.",
        "They are shown for context only and never feed the rating formula.",
      ],
    },
  ],
};

const MANAGER_RULES: RuleContent = {
  subtitle: "How the AI franchises bid",
  sections: [
    {
      title: "Bid model",
      items: [
        "Each AI carries its own purse, squad needs and role targets.",
        "It raises only within its valuation ceiling, holds when it must, and walks away without sentiment.",
        "Minimum-squad and overseas limits are resolved before every bid.",
      ],
    },
    {
      title: "No hindsight",
      items: ["The AI never sees the supplied 2026 sale price or a future lot outcome."],
    },
  ],
};

function rulesFor(pathname: string): RuleContent {
  if (/\/season(\/|$)/.test(pathname)) return SEASON_RULES;
  if (pathname.startsWith("/auction")) return { ...AUCTION_RULES, sections: [...AUCTION_RULES.sections, RTM_SECTION] };
  if (pathname.startsWith("/players") || pathname.startsWith("/compare")) return PLAYER_RULES;
  if (pathname.startsWith("/teams")) return TEAM_RULES;
  if (pathname.startsWith("/managers")) return MANAGER_RULES;
  return { ...AUCTION_RULES, sections: [...AUCTION_RULES.sections, RTM_SECTION] };
}

export function RulesDock() {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const content = useMemo(() => rulesFor(pathname ?? "/"), [pathname]);
  // The panel belongs to the page it was opened on, so navigating closes it
  // without an effect that writes state during the route transition.
  const open = openAt !== null && openAt === pathname;

  useEffect(() => {
    const openDock = () => setOpenAt(window.location.pathname);
    window.addEventListener("arena:open-rules", openDock);
    return () => window.removeEventListener("arena:open-rules", openDock);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenAt(open ? null : (pathname ?? "/"))}
        aria-label={open ? "Close page rules" : `Rules for this page: ${content.subtitle}`}
        aria-expanded={open}
        title="Page rules"
        className={cn(
          "fixed bottom-3 left-3 z-50 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[0.66rem] font-semibold shadow-lg backdrop-blur-xl transition-colors",
          open
            ? "border-gold/60 bg-gold text-[#231a06]"
            : "border-line bg-bg/90 text-muted hover:border-gold/50 hover:text-fg",
        )}
      >
        <BookOpen size={14} className={open ? "" : "text-gold"} /> Rules
      </button>
      {open && (
        <div className="pointer-events-none fixed inset-0 z-40 flex justify-center px-3 pt-24">
          <div
            className="animate-pop pointer-events-auto flex max-h-[76vh] w-[min(94vw,420px)] flex-col overflow-hidden rounded-2xl border border-line bg-bg/95 shadow-2xl backdrop-blur-xl"
            role="dialog"
            aria-label="Page rules"
          >
            <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <p className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-[0.12em]">
                  <BookOpen size={13} className="text-gold" /> Rules
                </p>
                <p className="mt-0.5 text-[0.58rem] text-faint">{content.subtitle}</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOpenAt(null)}
                aria-label="Close rules"
              >
                <X size={15} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 scrollbar-thin">
              {content.facts && content.facts.length > 0 && (
                <dl className="grid grid-cols-2 gap-2 text-[0.7rem]">
                  {content.facts.map((fact) => (
                    <div key={fact.label} className="rounded-lg border border-line bg-bg2/60 px-3 py-2">
                      <dt className="text-[0.55rem] uppercase tracking-[0.1em] text-faint">{fact.label}</dt>
                      <dd className="num mt-0.5 font-semibold">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {content.sections.map((section) => (
                <section key={section.title}>
                  <h3 className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-faint">{section.title}</h3>
                  {section.items.length > 0 && (
                    <ul className="mt-2 space-y-2">
                      {section.items.map((item) => (
                        <li key={item} className="flex gap-2 text-[0.68rem] leading-relaxed text-muted">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {section.steps && (
                    <ol className="mt-2 space-y-2">
                      {section.steps.map((step, index) => (
                        <li key={step.title} className="flex gap-2 text-[0.68rem] leading-relaxed">
                          <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface3 text-[0.6rem] font-bold">
                            {index + 1}
                          </span>
                          <span>
                            <span className="font-semibold text-fg">{step.title}.</span>{" "}
                            <span className="text-muted">{step.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}

              {content.note && (
                <p className="border-t border-line pt-3 text-[0.6rem] leading-relaxed text-faint">{content.note}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
