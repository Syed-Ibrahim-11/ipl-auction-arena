import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gavel } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import {
  RTM_PROCEDURE_2025,
  RULEBOOK_2026,
  RULEBOOK_2026_RTM,
  RULEBOOK_2027,
  validBidSlabsLabel,
} from "@/lib/rules";
import { formatLakh } from "@/lib/money";

export const metadata: Metadata = {
  title: "Auction Rulebook",
  description:
    "The auction rules used by the simulator: purses, squad limits, bid increments and the Right to Match procedure.",
};

export default function RulebookPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Rules"
        title="The auction rulebook"
        description="Purse, squad limits, bid increments and Right to Match — exactly as the simulator enforces them."
        actions={
          <>
            <Link href="/auction" className="btn btn-primary">
              Try the rules <ArrowRight size={15} />
            </Link>
            <PrintButton label="Print rulebook" />
          </>
        }
      />

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="surface-card p-5">
          <span className="chip chip-info">2026 · Open Mega Draft</span>
          <h2 className="mt-3 font-display text-2xl font-bold uppercase tracking-wide">Build from scratch</h2>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-line bg-surface2/50 px-3 py-2">
              <dt className="text-faint">Purse</dt>
              <dd className="num mt-0.5 font-semibold">{formatLakh(RULEBOOK_2026.purseCapLakh)}</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface2/50 px-3 py-2">
              <dt className="text-faint">Squad</dt>
              <dd className="num mt-0.5 font-semibold">
                {RULEBOOK_2026.squadMin}–{RULEBOOK_2026.squadMax}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-surface2/50 px-3 py-2">
              <dt className="text-faint">Overseas</dt>
              <dd className="num mt-0.5 font-semibold">Max {RULEBOOK_2026.overseasMax}</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface2/50 px-3 py-2">
              <dt className="text-faint">RTM</dt>
              <dd className="mt-0.5 font-semibold">Optional · {RULEBOOK_2026_RTM.rtmCards} cards</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Every franchise starts empty and builds a squad from the full player pool. Right to Match can be
            switched on or off before the first lot.
          </p>
        </div>

        <div className="surface-card p-5">
          <span className="chip chip-gold">2027 · Mini Auction</span>
          <h2 className="mt-3 font-display text-2xl font-bold uppercase tracking-wide">Keep the core</h2>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-line bg-surface2/50 px-3 py-2">
              <dt className="text-faint">Purse</dt>
              <dd className="num mt-0.5 font-semibold">{formatLakh(RULEBOOK_2027.purseCapLakh)}</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface2/50 px-3 py-2">
              <dt className="text-faint">Squad</dt>
              <dd className="num mt-0.5 font-semibold">
                {RULEBOOK_2027.squadMin}–{RULEBOOK_2027.squadMax}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-surface2/50 px-3 py-2">
              <dt className="text-faint">Overseas</dt>
              <dd className="num mt-0.5 font-semibold">Max {RULEBOOK_2027.overseasMax}</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface2/50 px-3 py-2">
              <dt className="text-faint">RTM</dt>
              <dd className="mt-0.5 font-semibold">Not available</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Retain as many 2026 players as you want at their existing contract value. The retention spend comes out
            of the purse before bidding.
          </p>
        </div>
      </section>

      <section id="purse" className="mt-12 scroll-mt-28">
        <SectionHeading
          eyebrow="Money and squad shape"
          title="Purse, squad and overseas limits"
          description="All money is held in whole lakhs."
        />
        <div className="surface-card mt-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>2026 Mega Draft</th>
                  <th>2027 Mini Auction</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-semibold">Auction purse</td>
                  <td className="num">{formatLakh(RULEBOOK_2026.purseCapLakh)}</td>
                  <td className="num">{formatLakh(RULEBOOK_2027.purseCapLakh)}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Squad size</td>
                  <td className="num">
                    {RULEBOOK_2026.squadMin}–{RULEBOOK_2026.squadMax}
                  </td>
                  <td className="num">
                    {RULEBOOK_2027.squadMin}–{RULEBOOK_2027.squadMax}
                  </td>
                </tr>
                <tr>
                  <td className="font-semibold">Overseas maximum</td>
                  <td className="num">{RULEBOOK_2026.overseasMax}</td>
                  <td className="num">{RULEBOOK_2027.overseasMax}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Right to Match</td>
                  <td>{RULEBOOK_2026_RTM.rtmCards} cards · optional</td>
                  <td>Not available</td>
                </tr>
                <tr>
                  <td className="font-semibold">Retentions</td>
                  <td>None — every squad starts empty</td>
                  <td>Existing 2026 contract value</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel mt-4 flex items-start gap-2.5 p-4">
          <Gavel size={15} className="mt-0.5 shrink-0 text-accent2" />
          <p className="text-xs leading-relaxed text-muted">
            A bid can never exceed the remaining purse after reserving the cost of reaching the minimum squad.
            The overseas cap is checked before a bid is accepted, and every debit lands in one atomic transaction.
          </p>
        </div>
      </section>

      <section id="increments" className="mt-12 scroll-mt-28">
        <SectionHeading
          eyebrow="Bidding mechanics"
          title="Bid increments"
          description="In live rooms the bid button always offers exactly the next valid amount."
        />
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="surface-card p-5">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Current bid</th>
                  <th className="text-right">Next increment</th>
                </tr>
              </thead>
              <tbody>
                {RULEBOOK_2026.increments.map((slab) => (
                  <tr key={slab.upToLakh ?? "above"}>
                    <td className="text-xs">
                      {slab.upToLakh === null ? "Above the last slab" : `Up to ${formatLakh(slab.upToLakh)}`}
                    </td>
                    <td className="num text-right font-semibold">{formatLakh(slab.incrementLakh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel p-5">
            <p className="text-sm font-semibold">How it reads</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{validBidSlabsLabel(RULEBOOK_2026)}</p>
            <p className="mt-3 border-t border-line pt-3 text-[0.65rem] leading-relaxed text-faint">
              The same slabs apply in the 2027 mini auction.
            </p>
          </div>
        </div>
      </section>

      <section id="rtm" className="mt-12 scroll-mt-28">
        <SectionHeading
          eyebrow="Optional in the 2026 mega draft"
          title="Right to Match"
          description="The leading bidder gets one final raise, then the original franchise chooses to match or decline."
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {RTM_PROCEDURE_2025.map((step) => (
            <div key={step.step} className="panel flex gap-3 p-4">
              <span className="num-pill h-7 min-w-7 shrink-0">{step.step}</span>
              <div>
                <p className="font-display text-sm font-bold uppercase tracking-wide">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-faint">
          Each team holds {RULEBOOK_2026_RTM.rtmCards} cards. A card is spent only when the original franchise
          successfully matches; declining a match leaves the card intact.
        </p>
      </section>
    </div>
  );
}
