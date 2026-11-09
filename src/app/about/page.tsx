import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  Database,
  Gavel,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Volume2,
} from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "About",
  description:
    "IPL Auction Arena is an independent auction simulator, post-auction season and cricket analytics project built on open ball-by-ball data, researched auction rules and explainable ratings.",
};

const PILLARS = [
  {
    icon: Database,
    title: "Real evidence",
    body: "Ratings and team profiles are built from 1,243 IPL matches and nearly 300,000 deliveries. Auction prices are kept separate from performance.",
  },
  {
    icon: Gavel,
    title: "A real auction",
    body: "Server-enforced purses, slab-correct increments, squad and overseas limits, an RTM state machine and ten AI opponents with different temperaments.",
  },
  {
    icon: Volume2,
    title: "A room you can hear",
    body: "An optional browser auctioneer calls the lot, the bid and the hammer with captions and a transcript. Speech and effects run locally; nothing is sent to a server.",
  },
  {
    icon: BrainCircuit,
    title: "Explainable analysis",
    body: "Every OVR opens into its component inputs, peer percentiles, shrinkage and role weights, so every rating can be traced back to the evidence.",
  },
  {
    icon: Trophy,
    title: "A season after the gavel",
    body: "Your squad enters a 74-fixture season. Pick the XI, captain, keeper and tactics, then play matches ball by ball or simulate to the final.",
  },
  {
    icon: BookOpen,
    title: "Researched rules",
    body: "Auction procedures are dated, sourced and tagged verified, verified with gaps, or pending. Future rules are never invented.",
  },
];

export default function AboutPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="About the project"
        title="Every bid has a reason"
        description="IPL Auction Arena is an independent simulator and analytics platform for people who want to understand how an IPL squad is actually built — and then take that squad through a season, not just watch a price ticker."
        actions={
          <>
            <Link href="/auction" className="btn btn-primary">
              Enter the auction room <ArrowRight size={15} />
            </Link>
            <Link href="/methodology" className="btn btn-outline">
              Rating methodology
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-success">Ball-by-ball evidence</span>
            <span className="chip">Server-authoritative auction</span>
            <span className="chip chip-gold">Independent · unaffiliated</span>
          </div>
        }
      />

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4 text-sm leading-relaxed text-muted">
          <p className="text-base leading-relaxed text-fg">
            The idea is simple: make the auction legible. A winning bid is the end of a negotiation shaped by purse,
            squad balance, scarcity and nerve — and by evidence. This project separates those forces instead of blurring
            them into one number.
          </p>
          <p>
            Players carry an analytical OVR built only from IPL batting, bowling and fielding evidence. The model is
            role-aware, peer-relative and honest about small samples. Auction prices are shown as outcomes, never fed
            back into the rating. That means you can disagree with the room without the model quietly agreeing with the
            price tag.
          </p>
          <p>
            The auction itself is a complete, server-enforced game. Ten franchises start with a purse and a plan. AI
            managers value players from evidence and squad need, then bid within their means. You can play a 2026 mini
            auction with existing squads, a fresh mega auction, the actual 2026 sold-player replay, or a 2025 RTM
            practice scenario. Every consequential action is atomic, reversible only by the rules, and recorded in an
            audit trail.
          </p>
          <p>
            When the last lot falls, the game keeps going. Your franchise enters a 74-fixture league season, you name
            the XI, batting order, captain, keeper and tactics, and every match is decided by a deterministic
            ball-by-ball engine. Other franchises are managed by the AI. You can watch your games delivery by delivery,
            simulate a matchday, or let the league play out — then follow the table, the playoffs and the awards.
          </p>
          <p>
            This is a learning tool and a game. It is not a betting product, a prediction service or an official IPL
            product. When the evidence is thin, the interface says so. When a rule is unverified, the rulebook says so.
            When a photograph is unavailable, there is a designed fallback rather than a stand-in face.
          </p>
        </div>

        <div className="space-y-3">
          <div className="surface-card p-5">
            <p className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide">
              <ShieldCheck size={17} className="text-accent2" /> What this is
            </p>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
              <li>· An auction simulator with full purse and squad arithmetic.</li>
              <li>· A transparent ratings system with an audit trail.</li>
              <li>· A sourced rulebook for 2026 mini and 2025 mega auctions.</li>
              <li>· A full post-auction season with lineups, tactics, scorecards and playoffs.</li>
              <li>· A cricket analytics explorer with player, team and comparison views.</li>
            </ul>
          </div>
          <div className="surface-card p-5">
            <p className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide">
              <Sparkles size={17} className="text-accent2" /> What this is not
            </p>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
              <li>· Not affiliated with the BCCI, IPL or any franchise.</li>
              <li>· Not an official auction feed or price predictor.</li>
              <li>· Not a complete record of the 2026 auction: the supplied file contains sold players only.</li>
              <li>· Not a replacement for the official player regulations.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading
          eyebrow="Design principles"
          title="Six things the product refuses to fake"
          description="These principles constrain what the interface can claim and how the database is shaped."
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div key={pillar.title} className="surface-card flex gap-4 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent2">
                  <Icon size={19} />
                </span>
                <div>
                  <p className="font-display text-base font-bold uppercase tracking-wide">{pillar.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{pillar.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading
          eyebrow="After the gavel"
          title="The auction is only the first innings"
          description="A squad is not a trophy. Once the room closes, your franchise gets a fixture list, a dressing room and consequences."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <SeasonStep
            number="01"
            title="Name the XI"
            body="Pick 11 players inside the four-overseas cap, set the batting order, name a captain and a designated keeper. Short squads receive zero-fee call-ups from the current IPL pool — never invented players."
          />
          <SeasonStep
            number="02"
            title="Take charge or simulate"
            body="Play your fixtures ball by ball in the match centre, or simulate a ball, an over, an innings, a matchday or the whole league. Every other franchise is run by its AI manager."
          />
          <SeasonStep
            number="03"
            title="Chase the trophy"
            body="A full league table with net run rate, a top-four playoff bracket, batting, bowling and MVP awards, and a champion — all computed from the simulated scorecards."
          />
        </div>
        <div className="surface-card mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-xs leading-relaxed text-muted">
            <span className="font-semibold text-fg">74 fixtures:</span> 70 league matches and four playoff
            slots, built from the 2026 match archive in this workspace.{" "}
            <Link href="/sources" className="font-semibold text-accent2 hover:underline">
              Schedule provenance
            </Link>{" "}
            is documented in the source register, including the missing fixtures attachment.
          </p>
          <Link href="/auction" className="btn btn-primary btn-sm shrink-0">
            Build a squad <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-5 lg:grid-cols-2">
        <div className="surface-card p-5">
          <Users size={18} className="text-accent2" />
          <p className="mt-3 font-display text-base font-bold uppercase tracking-wide">Ten AI managers</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Each franchise has a persistent temperament: aggressive, balanced, conservative, analytic or
            squad-builder. They share one evidence base but weigh need, scarcity and budget differently. Their bids are
            deterministic for a given auction state, not random theatre.
          </p>
          <Link href="/managers" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent2 hover:underline">
            Meet the managers <ArrowUpRight size={12} />
          </Link>
        </div>
        <div className="surface-card p-5">
          <BarChart3 size={18} className="text-accent2" />
          <p className="mt-3 font-display text-base font-bold uppercase tracking-wide">Ratings you can audit</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            The OVR is not a black box. Each profile exposes the raw career inputs, peer medians, percentile,
            reliability shrinkage and the exact role weights used. The methodology page walks through a live stored
            record.
          </p>
          <Link href="/methodology" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent2 hover:underline">
            See the formula <ArrowUpRight size={12} />
          </Link>
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading eyebrow="Under the hood" title="Built to be checked" />
        <div className="surface-card mt-6 grid gap-6 p-6 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">Data & analysis</p>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
              <li>· Cricsheet ball-by-ball archive, ODC-BY 1.0.</li>
              <li>· openIPL 2026 metadata, data CC BY 4.0 and code MIT.</li>
              <li>· Wikidata enrichment, CC0 1.0.</li>
              <li>· Supplied 2026 sold-player auction list.</li>
              <li>· 2026 match archive for dates, venues and season pairings.</li>
              <li>· SQLite with foreign keys, integer lakh arithmetic and transaction boundaries.</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">Application</p>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
              <li>· Next.js App Router with React Server Components.</li>
              <li>· Server-authoritative auction API; the client never owns the ledger.</li>
              <li>· Deterministic ball-by-ball T20 engine for every season fixture.</li>
              <li>· Browser-local auctioneer speech and effects, with captions and a transcript.</li>
              <li>· Accessible, responsive interface with a Classic theme option.</li>
              <li>· No accounts, no advertising trackers, no player photographs without a verified licence.</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/sources" className="btn btn-outline btn-sm">
            <Database size={14} /> Source register
          </Link>
          <Link href="/admin" className="btn btn-outline btn-sm">
            <ShieldCheck size={14} /> Data quality dashboard
          </Link>
          <Link href="/rulebook" className="btn btn-outline btn-sm">
            <BookOpen size={14} /> Auction rulebook
          </Link>
        </div>
      </section>

      <section className="mt-14 border-t border-line pt-6">
        <p className="max-w-4xl text-[0.7rem] leading-relaxed text-faint">
          IPL Auction Arena is an independent project. It is not affiliated with, endorsed by or connected to the Board
          of Control for Cricket in India, the Indian Premier League or any franchise. Team names and colours, franchise
          crests and player portraits are used for identification only; crests and portraits are retrieved from
          iplt20.com and remain the property of their respective owners. Broadcast marks, trophy images and footage are
          not reproduced. All ratings are this project&apos;s own analytical scores, not official ratings.
        </p>
      </section>
    </div>
  );
}

function SeasonStep({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="surface-card relative overflow-hidden p-5">
      <span className="num absolute right-4 top-3 font-display text-4xl font-bold text-fg/5">{number}</span>
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-accent2">Step {number}</p>
      <p className="mt-2 font-display text-base font-bold uppercase tracking-wide">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{body}</p>
    </div>
  );
}
