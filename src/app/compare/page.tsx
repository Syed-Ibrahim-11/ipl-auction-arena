import type { Metadata } from "next";
import Link from "next/link";
import { CompareBoard } from "@/components/compare/compare-board";
import { PageHeader } from "@/components/ui";
import { getComparePool, getPlayerProfile, type PlayerProfile } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Player Comparison",
  description:
    "Compare up to three IPL players side by side: role-weighted ratings, career batting and bowling evidence, fielding and 2026 context.",
};

interface SearchParams {
  p?: string | string[];
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const pool = getComparePool();
  const poolIds = new Set(pool.map((entry) => entry.id));
  const requested = Array.isArray(params.p) ? params.p : params.p ? [params.p] : [];
  const explicit = requested.length > 0;
  let ids = [...new Set(requested.filter((id) => poolIds.has(id)))].slice(0, 3);
  if (!explicit) ids = pool.slice(0, 2).map((entry) => entry.id);

  const profiles = ids
    .map((id) => getPlayerProfile(id))
    .filter((profile): profile is PlayerProfile => profile !== null);

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Head to head · evidence, not vibes"
        title="Compare players"
        description="Put up to three players on the same board. Ratings, career output, bowling control and 2026 context are drawn from the same archive — with missing evidence marked instead of guessed."
        actions={
          <>
            <Link href="/players" className="btn btn-outline">
              Player explorer
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-info">Same rating formula</span>
            <span className="chip chip-success">Ball-by-ball evidence</span>
            <span className="chip chip-gold">Auction prices kept separate</span>
          </div>
        }
      />

      <div className="mt-8">
        <CompareBoard pool={pool} profiles={profiles} />
      </div>

      <div className="panel mt-8 p-4 text-xs leading-relaxed text-faint">
        <strong className="text-muted">Reading the comparison:</strong> each discipline is scored on a 0–100 peer
        scale and combined using role weights, so a keeper-batter and a specialist seamer are compared on their own
        job descriptions. Career rates use ball-by-ball data from the Cricsheet IPL archive. Auction prices are
        supplied outcomes shown as context and are deliberately excluded from ratings and best-value marks.
      </div>
    </div>
  );
}
