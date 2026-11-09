import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  KeyRound,
  Users,
  Wifi,
} from "lucide-react";
import { PlayerAvatar } from "@/components/brand/player-avatar";
import { TeamBadge } from "@/components/brand/team-badge";
import { OvrBadge, RoleChip } from "@/components/ui";
import { AUCTION_MODES } from "@/lib/auction/modes";
import { getHomeHero } from "@/lib/data/queries";
import { formatLakh } from "@/lib/money";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const data = getHomeHero();
  const featuredBuy = data.topBuy;

  return (
    <div>
      <section className="relative isolate overflow-hidden border-b border-line/70">
        <Image
          src="/images/arena-hero.png"
          alt="Floodlit cricket stadium at night"
          fill
          preload
          sizes="100vw"
          className="object-cover object-center opacity-65"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--bg)_0%,color-mix(in_srgb,var(--bg)_88%,transparent)_46%,color-mix(in_srgb,var(--bg)_30%,transparent)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,var(--bg)_100%)]" />
        <div className="container-page relative grid gap-12 pb-20 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pb-28 lg:pt-24">
          <div className="animate-fade-up">
            <p className="eyebrow">IPL 2026 · auction simulator</p>
            <h1 className="display-xl mt-5 max-w-[12ch]">
              Build your
              <br />
              <span className="text-accent2">ultimate</span> squad
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Step into a live auction room with ten franchises, real IPL evidence and a purse that
              punishes sentiment. Scout {data.counts.players.toLocaleString("en-IN")} current IPL
              players, outbid the room, then take your squad through a full simulated season.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/auction" className="btn btn-primary btn-lg">
                Enter the auction room
                <ArrowUpRight size={18} />
              </Link>
              <Link href="/players" className="btn btn-outline btn-lg">
                Explore the player pool
              </Link>
            </div>
            <p className="mt-4 text-[0.7rem] text-faint">
              Tip: press{" "}
              <kbd className="rounded border border-line bg-surface2 px-1.5 py-0.5 text-[0.62rem] font-semibold">
                ⌘K
              </kbd>{" "}
              anywhere to search any player, franchise or page.
            </p>
            <dl className="mt-12 grid max-w-xl grid-cols-2 gap-x-8 gap-y-6 border-t border-line/80 pt-7 sm:grid-cols-4">
              {[
                { label: "IPL 2026 players", value: data.counts.players.toLocaleString("en-IN") },
                { label: "IPL matches", value: data.counts.matches.toLocaleString("en-IN") },
                { label: "Deliveries parsed", value: `${Math.round(data.counts.deliveries / 1000)}k` },
                { label: "Seasons", value: data.counts.seasons },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-faint">
                    {stat.label}
                  </dt>
                  <dd className="stat-value mt-1.5">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:ml-auto">
            <div className="hero-orbit -right-16 -top-20 hidden h-72 w-72 lg:block" aria-hidden="true" />
            <div className="surface-card relative overflow-hidden p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="chip chip-accent">
                  <span className="live-dot" aria-hidden="true" /> Auction board
                </span>
                <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-faint">
                  2026 · verified lots
                </span>
              </div>
              {featuredBuy ? (
                <div className="mt-5">
                  <div className="flex items-start gap-4">
                    <PlayerAvatar
                      name={featuredBuy.name}
                      teamId={featuredBuy.buyerTeamId}
                      role={featuredBuy.role}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="font-display text-2xl font-bold uppercase leading-none tracking-wide">
                        {featuredBuy.name}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <RoleChip role={featuredBuy.role} />
                        <span className="chip">Verified sale</span>
                      </div>
                    </div>
                    <div className="ml-auto">
                      <OvrBadge value={featuredBuy.ovr} size="sm" />
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface2/70 p-3">
                    <div>
                      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">Base</p>
                      <p className="num mt-1 text-sm font-semibold">{formatLakh(featuredBuy.basePriceLakh)}</p>
                    </div>
                    <div>
                      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">Hammer</p>
                      <p className="num mt-1 text-sm font-semibold text-accent2">
                        {formatLakh(featuredBuy.winningBidLakh)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">Buyer</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                        <TeamBadge teamId={featuredBuy.buyerTeamId} size={18} />
                        {featuredBuy.buyerShort ?? "—"}
                      </p>
                    </div>
                  </div>
                  <Link href="/auction" className="link-arrow mt-4 inline-flex">
                    Take the same lot in your room <ArrowRight size={14} />
                  </Link>
                </div>
              ) : (
                <p className="mt-6 text-sm text-muted">Import the auction dataset to populate the board.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-20">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Two ways to play</p>
            <h2 className="section-title mt-2">Pick your auction</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              A constrained mini auction built on official 2026 squads, or a full open mega draft with
              Right to Match as an optional switch.
            </p>
          </div>
          <Link href="/auction" className="link-arrow">
            Open the auction lobby <ArrowRight size={15} />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {AUCTION_MODES.map((mode) => (
            <Link
              key={mode.id}
              href={`/auction?mode=${mode.id}#create`}
              className="surface-card card-hover group relative flex flex-col overflow-hidden p-5"
            >
              <div className="flex items-center justify-between">
                <span
                  className="chip"
                  style={{ color: mode.accent, borderColor: `color-mix(in srgb, ${mode.accent} 36%, transparent)` }}
                >
                  {mode.kicker}
                </span>
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-faint">
                  {mode.difficulty}
                </span>
              </div>
              <h3 className="mt-5 font-display text-[1.65rem] font-bold uppercase leading-none tracking-wide">
                {mode.name}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{mode.tagline}</p>
              <ul className="mt-4 space-y-1.5 text-[0.78rem] text-muted">
                {mode.features.slice(0, 3).map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: mode.accent }} />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-faint">
                  {mode.expectedLots} lots
                </span>
                <span className="link-arrow text-[0.8rem]">
                  Set up <ArrowUpRight size={14} />
                </span>
              </div>
              <div
                className="absolute inset-x-0 bottom-0 h-[2px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: mode.accent }}
              />
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-bg2/50">
        <div className="container-page py-20">
          <div className="max-w-3xl">
            <p className="eyebrow">Multiplayer rooms</p>
            <h2 className="section-title mt-2 max-w-lg">Ten seats. One room. Any device.</h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
              Host a private auction, share a six-character code and let friends claim franchises in
              real time. Every seat left open is taken by an AI manager that bids to its own purse,
              squad needs and valuation model — so a room of one still feels like a room of ten.
            </p>
            <ul className="mt-7 grid gap-4 sm:grid-cols-3">
              {[
                { icon: Users, title: "Friend-ready", body: "One shared board. Live bids, purses and hammers for every manager." },
                { icon: Bot, title: "AI fills the gaps", body: "Unclaimed franchises hold their ceiling and walk away without sentiment." },
                { icon: Wifi, title: "Server-synced", body: "The host controls the clock. Every client sees the same state." },
              ].map((item) => (
                <li key={item.title} className="surface-card p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface2 text-accent2">
                    <item.icon size={16} />
                  </span>
                  <p className="mt-3 font-display text-sm font-semibold uppercase tracking-wide">{item.title}</p>
                  <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">{item.body}</p>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/auction/multiplayer" className="btn btn-primary">
                Host a room <ArrowRight size={16} />
              </Link>
              <Link href="/auction/join" className="btn btn-ghost">
                <KeyRound size={15} /> Join with a code
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
