import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  Database,
  FileWarning,
  Fingerprint,
  Gauge,
  ImageIcon,
  Info,
  Layers,
  ListChecks,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { PageHeader, SectionHeading, StatBlock } from "@/components/ui";
import { AdminLogin } from "@/components/admin/admin-login";
import { DeleteRoomButton } from "@/components/admin/delete-room-button";
import { getQualityReport } from "@/lib/data/quality";
import { RATING_FORMULA_VERSION } from "@/lib/ratings";
import { adminConfigured, isAdminAuthenticated } from "@/lib/admin/auth";
import { loadAdminOps } from "@/lib/admin/ops";
import { clearCacheAction, deleteRoomAction, logoutAction, recomputeRatingsAction } from "./actions";
import { formatLakh } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Control Room",
  description:
    "Operator-only control room for IPL Auction Arena: live data quality, rating rebuilds, room and tournament inspection, asset coverage and an audit trail.",
  robots: { index: false, follow: false },
};

const ROLE_ORDER = ["batter", "all-rounder", "bowler", "wicketkeeper", "unknown"];

const CHECK_TONE: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  pass: { icon: CheckCircle2, color: "var(--success)", label: "Pass" },
  warn: { icon: AlertTriangle, color: "var(--gold)", label: "Attention" },
  info: { icon: Info, color: "var(--info)", label: "Context" },
};

function formatTableName(table: string): string {
  return table.replaceAll("_", " ");
}

function percent(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; rated?: string }>;
}) {  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return <AdminLogin configured={adminConfigured()} />;
  }

  const params = await searchParams;
  const ops = loadAdminOps();
  const report = getQualityReport();
  const passing = report.checks.filter((check) => check.status === "pass").length;
  const warnings = report.checks.filter((check) => check.status === "warn").length;
  const identityLinks = report.latestImport?.report?.identityLinks ?? {};
  const auctionOnly = report.latestImport?.report?.auctionOnlyPlayers ?? 0;
  const players = report.players;
  const roleTotal = players.byRole.reduce((sum, role) => sum + role.count, 0);
  const sortedRoles = [...players.byRole].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );
  const importedAt = report.latestImport?.finishedAt ?? report.latestImport?.startedAt ?? null;

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow={`Operator console · schema v${report.schemaVersion ?? "?"}`}
        title="Control room"
        description="Live operational control for the simulator. Rebuild ratings, clear caches, inspect auction rooms and tournaments, and audit every action — all behind a signed operator session."
        actions={
          <>
            <Link href="/api/admin/report" className="btn btn-primary">
              Download audit JSON <ArrowDownToLine size={15} />
            </Link>
            <Link href="/admin/players" className="btn btn-outline">
              Player ledger
            </Link>
            <Link href="/admin/auction-2026" className="btn btn-outline">
              2026 sold prices
            </Link>
            <Link href="/sources" className="btn btn-outline">
              Source register
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost">
                Lock console <LogOut size={14} />
              </button>
            </form>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-success">
              <ShieldCheck size={11} /> Operator verified
            </span>
            <span className={report.latestImport?.status === "success" ? "chip chip-success" : "chip chip-gold"}>
              Import {report.latestImport?.status ?? "missing"}
            </span>
            <span className="chip">Cut-off {report.dataCutoff ?? "unknown"}</span>
            <span className="chip">Formula {RATING_FORMULA_VERSION}</span>
            <span className="chip chip-info">
              {passing} passes · {warnings} attention
            </span>
            {importedAt && (
              <span className="chip">
                Built{" "}
                <time dateTime={importedAt}>
                  {new Date(importedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </span>
            )}
          </div>
        }
      />

      {params.notice === "ratings" && (
        <p className="mt-6 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          Ratings rebuilt for {params.rated ?? "all"} players and the full layout was revalidated.
        </p>
      )}
      {params.notice === "cache" && (
        <p className="mt-6 rounded-xl border border-info/40 bg-info/10 px-4 py-3 text-sm text-info">
          Application layout revalidated. Cached pages will render fresh on the next request.
        </p>
      )}
      {params.notice === "deleted" && (
        <p className="mt-6 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          Room deleted. Its lots, bids, chat and squads were removed with it.
        </p>
      )}
      {params.notice === "missing" && (
        <p className="mt-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          That room no longer exists.
        </p>
      )}

      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatBlock
          label="Players"
          value={ops.counts.activePlayers.toLocaleString("en-IN")}
          hint={`${ops.counts.rated} rated · ${(ops.counts.players - ops.counts.activePlayers).toLocaleString("en-IN")} archived`}
        />
        <StatBlock label="Auction rooms" value={ops.counts.sessions.toLocaleString("en-IN")} hint={`${ops.counts.lots.toLocaleString("en-IN")} lots created`} />
        <StatBlock label="Seasons" value={ops.counts.seasons.toLocaleString("en-IN")} hint="Tournament runs" />
        <StatBlock label="Franchises" value={ops.counts.teams.toLocaleString("en-IN")} hint={`${ops.assets.teams} official crests`} />
        <StatBlock label="Official photos" value={ops.assets.players.toLocaleString("en-IN")} hint={`Synced ${new Date(ops.assets.generatedAt).toLocaleDateString("en-IN")}`} />
        <StatBlock label="Data checks" value={`${passing}/${report.checks.length}`} hint={`${warnings} need attention`} />
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Gauge size={16} className="text-accent2" />
            <h2 className="font-display text-base font-bold uppercase tracking-wide">Operations</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            These actions write to the live database or cached layout. Each one is recorded in the audit trail
            below with your address and a timestamp.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <form action={recomputeRatingsAction} className="panel flex flex-col gap-2 p-4">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <RefreshCw size={14} className="text-accent2" /> Rebuild ratings
              </span>
              <p className="text-[0.7rem] leading-relaxed text-faint">
                Recompute every season snapshot and the current overview from stored season aggregates using the
                active formula.
              </p>
              <button type="submit" className="btn btn-primary btn-sm mt-auto self-start">
                Run rebuild
              </button>
            </form>
            <form action={clearCacheAction} className="panel flex flex-col gap-2 p-4">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Layers size={14} className="text-info" /> Clear page cache
              </span>
              <p className="text-[0.7rem] leading-relaxed text-faint">
                Revalidate the full application layout after an import, asset sync or rating rebuild.
              </p>
              <button type="submit" className="btn btn-outline btn-sm mt-auto self-start">
                Revalidate all
              </button>
            </form>
            <div className="panel flex flex-col gap-2 p-4">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Table2 size={14} className="text-accent2" /> Player ledger
              </span>
              <p className="text-[0.7rem] leading-relaxed text-faint">
                Portraits, IPL career records, overall ratings and the fair price after the 18% valuation haircut.
                Player-facing pages never show OVR or fair value.
              </p>
              <Link href="/admin/players" className="btn btn-outline btn-sm mt-auto self-start">
                Open ledger
              </Link>
            </div>
            <div className="panel flex flex-col gap-2 p-4">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ImageIcon size={14} className="text-gold" /> Official brand assets
              </span>
              <p className="text-[0.7rem] leading-relaxed text-faint">
                {ops.assets.teams} franchise crests and {ops.assets.players} squad portraits are stored locally
                from the public IPL team pages. Missing or unmatched players fall back to illustrated portraits.
                Refresh with <code className="font-mono">npm run assets:brand</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-success" />
            <h2 className="font-display text-base font-bold uppercase tracking-wide">Live health</h2>
          </div>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-faint">Rating coverage</dt>
              <dd className="num font-semibold">
                {percent(ops.counts.rated, Math.max(1, ops.counts.players))}% of the registry
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-faint">Active rooms</dt>
              <dd className="num font-semibold">
                {ops.sessions.filter((row) => row.status === "active").length}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-faint">Completed rooms</dt>
              <dd className="num font-semibold">
                {ops.sessions.filter((row) => row.status === "completed").length}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-faint">Idle / abandoned rooms</dt>
              <dd className="num font-semibold" style={{ color: ops.counts.idleSessions > 0 ? "var(--gold)" : undefined }}>
                {ops.counts.idleSessions}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-faint">Tournaments in flight</dt>
              <dd className="num font-semibold">
                {ops.seasons.filter((row) => row.status !== "completed").length}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-faint">Asset snapshot</dt>
              <dd className="num font-semibold">
                {new Date(ops.assets.generatedAt).toLocaleString("en-IN", { dateStyle: "medium" })}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-[0.62rem] leading-relaxed text-faint">
            Counts are queried live from SQLite on every request. No admin data is cached across sessions.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          eyebrow="Rooms"
          title="Auction rooms"
          description="Every room in the database, newest first. Rooms whose host left are flagged so they can be cleared out."
        />
        {ops.counts.idleSessions > 0 && (
          <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs text-gold">
            {ops.counts.idleSessions} room{ops.counts.idleSessions === 1 ? "" : "s"} idle or abandoned.
            Delete them below to keep the lobby clean.
          </p>
        )}
        <div className="mt-5 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="bg-surface2/60 text-[0.58rem] uppercase tracking-[0.12em] text-faint">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Room</th>
                <th className="px-4 py-2.5 font-semibold">Mode</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Humans</th>
                <th className="px-4 py-2.5 font-semibold">Lots</th>
                <th className="px-4 py-2.5 font-semibold">Last activity</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {ops.sessions.map((row) => (
                <tr key={row.id} className="hover:bg-surface2/40">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold">{row.name}</p>
                    <p className="mt-0.5 text-[0.58rem] text-faint">
                      {row.joinCode ? `Code ${row.joinCode}` : "Solo room"}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{row.mode.replaceAll("-", " ")}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      <span
                        className={
                          row.status === "completed"
                            ? "chip chip-success"
                            : row.status === "abandoned"
                              ? "chip"
                              : "chip chip-info"
                        }
                      >
                        {row.status}
                      </span>
                      {row.idle && row.status !== "abandoned" && <span className="chip chip-gold">Left idle</span>}
                    </span>
                  </td>
                  <td className="num px-4 py-2.5 text-muted">
                    {row.joinCode ? `${row.onlineHumans}/${row.humans} online` : "—"}
                  </td>
                  <td className="num px-4 py-2.5">
                    {row.resolvedLots}/{row.totalLots}
                  </td>
                  <td className="px-4 py-2.5 text-faint">
                    {new Date(row.lastSeenAt ?? row.updatedAt).toLocaleString("en-IN", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/auction/${row.id}`} className="text-accent2 hover:underline">
                        Open
                      </Link>
                      <form action={deleteRoomAction}>
                        <input type="hidden" name="sessionId" value={row.id} />
                        <DeleteRoomButton name={row.name} />
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {ops.sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-faint">
                    No auction rooms yet. Create one from the lobby to populate this table.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="min-w-0">
          <SectionHeading eyebrow="Tournaments" title="Season runs" description="Auction-to-fixture pipelines and their progress through the real match engine." />
          <div className="mt-5 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[540px] text-left text-xs">
              <thead className="bg-surface2/60 text-[0.58rem] uppercase tracking-[0.12em] text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Season</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Matches</th>
                  <th className="px-4 py-2.5 font-semibold">Champion</th>
                  <th className="px-4 py-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {ops.seasons.map((row) => (
                  <tr key={row.id} className="hover:bg-surface2/40">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{row.sessionName}</p>
                      <p className="text-[0.6rem] text-faint">IPL {row.seasonYear}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={row.status === "completed" ? "chip chip-success" : "chip chip-info"}>
                        {row.status}
                      </span>
                    </td>
                    <td className="num px-4 py-2.5">
                      {row.played}/{row.fixtures || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{row.championName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/auction/${row.sessionId}/season`} className="text-accent2 hover:underline">
                        Hub
                      </Link>
                    </td>
                  </tr>
                ))}
                {ops.seasons.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-faint">
                      No season has been started yet. Finish an auction, then launch the tournament.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="min-w-0">
          <SectionHeading eyebrow="Audit" title="Operator trail" description="Recent privileged actions, newest first." />
          <ol className="mt-5 divide-y divide-line/60 rounded-xl border border-line">
            {ops.audit.map((row) => (
              <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface2 text-faint">
                  <ListChecks size={12} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{row.action.replaceAll("-", " ")}</p>
                  <p className="mt-0.5 text-[0.66rem] leading-snug text-muted">{row.detail ?? "—"}</p>
                  <p className="num mt-0.5 text-[0.55rem] text-faint">
                    {new Date(row.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    {row.address ? ` · ${row.address}` : ""}
                  </p>
                </div>
              </li>
            ))}
            {ops.audit.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-faint">
                No privileged actions recorded yet.
              </li>
            )}
          </ol>
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          eyebrow="Integrity"
          title="Checks that must hold"
          description="Structural checks run on the live file, followed by dataset-specific assertions and explicit context where evidence is missing."
        />
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {report.checks.map((check) => {
            const tone = CHECK_TONE[check.status] ?? CHECK_TONE.info;
            const Icon = tone.icon;
            return (
              <div key={check.id} className="panel flex gap-3 p-4">
                <Icon size={18} style={{ color: tone.color }} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{check.label}</p>
                    <span className="text-[0.58rem] font-semibold uppercase tracking-[0.12em]" style={{ color: tone.color }}>
                      {tone.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{check.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-12 grid gap-5 xl:grid-cols-[1.05fr_1fr]">
        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-accent2" />
            <h2 className="font-display text-base font-bold uppercase tracking-wide">Latest import run</h2>
          </div>
          {report.latestImport ? (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <dt className="text-faint">Run ID</dt>
                  <dd className="mt-1 break-all font-mono text-[0.7rem]">{report.latestImport.id}</dd>
                </div>
                <div>
                  <dt className="text-faint">Status</dt>
                  <dd className="mt-1 font-semibold">{report.latestImport.status}</dd>
                </div>
                <div>
                  <dt className="text-faint">Started</dt>
                  <dd className="mt-1">{new Date(report.latestImport.startedAt).toLocaleString("en-IN")}</dd>
                </div>
                <div>
                  <dt className="text-faint">Finished</dt>
                  <dd className="mt-1">
                    {report.latestImport.finishedAt
                      ? new Date(report.latestImport.finishedAt).toLocaleString("en-IN")
                      : "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Errors</dt>
                  <dd className="mt-1" style={{ color: report.latestImport.errorsCount > 0 ? "var(--danger)" : "var(--success)" }}>
                    {report.latestImport.errorsCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Warnings</dt>
                  <dd className="mt-1" style={{ color: report.latestImport.warningsCount > 0 ? "var(--gold)" : "var(--success)" }}>
                    {report.latestImport.warningsCount}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                <div>
                  <p className="num font-display text-lg font-bold">{report.latestImport.report?.counts?.matches?.toLocaleString("en-IN") ?? "—"}</p>
                  <p className="text-[0.6rem] uppercase tracking-[0.12em] text-faint">Matches</p>
                </div>
                <div>
                  <p className="num font-display text-lg font-bold">{report.latestImport.report?.counts?.players?.toLocaleString("en-IN") ?? "—"}</p>
                  <p className="text-[0.6rem] uppercase tracking-[0.12em] text-faint">Players</p>
                </div>
                <div>
                  <p className="num font-display text-lg font-bold">{report.latestImport.report?.counts?.deliveries?.toLocaleString("en-IN") ?? "—"}</p>
                  <p className="text-[0.6rem] uppercase tracking-[0.12em] text-faint">Deliveries</p>
                </div>
              </div>
              <p className="mt-4 text-[0.65rem] leading-relaxed text-faint">
                Rebuild with <code className="rounded bg-surface2 px-1.5 py-0.5">npm run import-data</code>. The command reads the
                local source archive and writes a fresh database, import report and summary.
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">No import run is recorded. Run the import command to build the database.</p>
          )}
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Fingerprint size={16} className="text-accent2" />
            <h2 className="font-display text-base font-bold uppercase tracking-wide">Source register</h2>
          </div>
          <ul className="mt-4 space-y-3">
            {report.sources.map((source) => (
              <li key={source.id} className="border-b border-line/60 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{source.name}</p>
                    <p className="mt-0.5 text-[0.65rem] text-faint">
                      {source.license ?? "Licence not recorded"} · {source.recordCount?.toLocaleString("en-IN") ?? "?"} records
                    </p>
                  </div>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-accent2 hover:underline"
                    >
                      Source <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
                <p className="mt-1 text-[0.65rem] leading-relaxed text-muted">{source.notes}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-12 grid gap-5 xl:grid-cols-3">
        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-accent2" />
            <h2 className="font-display text-base font-bold uppercase tracking-wide">Role coverage</h2>
          </div>
          <div className="mt-4 space-y-3">
            {sortedRoles.map((role) => (
              <div key={role.role}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="capitalize">{role.role === "unknown" ? "Unclassified" : role.role.replace("-", " ")}</span>
                  <span className="num text-muted">
                    {role.count.toLocaleString("en-IN")} · {percent(role.count, roleTotal)}%
                  </span>
                </div>
                <div className="progress-track mt-1.5">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${percent(role.count, roleTotal)}%`,
                      background: role.role === "unknown" ? "var(--faint)" : "var(--accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[0.65rem] leading-relaxed text-faint">
            Unclassified players keep a neutral role split. The app never infers a role from nationality or auction price.
          </p>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Table2 size={16} className="text-accent2" />
            <h2 className="font-display text-base font-bold uppercase tracking-wide">Field completeness</h2>
          </div>
          <ul className="mt-4 space-y-3 text-xs">
            {[
              { label: "Cricsheet identity", missing: players.total - players.withCricsheetId },
              { label: "Wikidata identity", missing: players.total - players.withWikidataId },
              { label: "Birth date", missing: players.missingBirthDate },
              { label: "Nationality", missing: players.missingNationality },
              { label: "Overseas flag", missing: players.missingOverseas },
            ].map((field) => (
              <li key={field.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span>{field.label}</span>
                  <span className="num text-muted">
                    {field.missing.toLocaleString("en-IN")} missing · {percent(players.total - field.missing, players.total)}% present
                  </span>
                </div>
                <div className="progress-track mt-1.5">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${percent(players.total - field.missing, players.total)}%`,
                      background: "var(--info)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.65rem] leading-relaxed text-faint">
            Blank values are shown as unavailable in the UI. No birth date, nationality or overseas status is guessed to fill a gap.
          </p>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-accent2" />
            <h2 className="font-display text-base font-bold uppercase tracking-wide">Rating evidence</h2>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <p className="num font-display text-3xl font-bold">
              {report.ratings.min ?? "—"}–{report.ratings.max ?? "—"}
            </p>
            <p className="text-xs text-muted">current OVR range · mean {report.ratings.average ?? "—"}</p>
          </div>
          <div className="mt-4 space-y-2.5">
            {report.ratings.byEvidence.map((band) => (
              <div key={band.evidence} className="flex items-center justify-between gap-2 text-xs">
                <span className="capitalize">{band.evidence}</span>
                <span className="num text-muted">{band.count.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-faint">Season snapshots</p>
            <div className="mt-2 space-y-1.5 text-xs">
              {report.ratings.versions.map((version) => (
                <div key={version.season} className="flex items-center justify-between">
                  <span>{version.season}</span>
                  <span className="num text-muted">
                    {version.rated.toLocaleString("en-IN")} rated / {version.rows.toLocaleString("en-IN")} rows
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          eyebrow="Auction reconciliation"
          title="77 sold players, nothing inferred"
          description="The supplied auction file contains sold players only. It does not contain an unsold list, retention values or a complete set list."
        />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatBlock
            label="Base prices verified"
            value={`${report.auction.verifiedBasePrices}/${report.auction.rows}`}
            hint="Base price copied from the supplied CSV"
          />
          <StatBlock
            label="Buyer + winning bid"
            value={`${report.auction.withBuyerAndPrice}/${report.auction.rows}`}
            hint="Both outcomes present"
          />
          <StatBlock
            label="Total winning bids"
            value={formatLakh(report.auction.totalSpendLakh)}
            hint={report.auction.highestPlayer ? `Highest: ${report.auction.highestPlayer} at ${formatLakh(report.auction.highestBidLakh)}` : undefined}
          />
          <StatBlock
            label="Winning bids below base"
            value={report.auction.belowBasePrice}
            hint="Expected zero; validated on every load"
          />
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h3 className="font-display text-sm font-bold uppercase tracking-wide">Identity resolution</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th className="text-right">Links</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(identityLinks).map(([method, count]) => (
                  <tr key={method}>
                    <td className="capitalize">{method.replaceAll("_", " ")}</td>
                    <td className="num text-right">{count.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
                <tr>
                  <td>Auction-only players (no Cricsheet match)</td>
                  <td className="num text-right">{auctionOnly}</td>
                </tr>
                <tr>
                  <td>Original team derived for RTM</td>
                  <td className="num text-right">{report.auction.originalTeamDerived}</td>
                </tr>
                <tr>
                  <td>RTM-eligible under 2026 mini rules</td>
                  <td className="num text-right">{report.auction.rtmEligible}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="panel p-5 text-xs leading-relaxed text-muted">
            <p className="flex items-center gap-2 font-semibold text-fg">
              <FileWarning size={16} className="text-gold" /> Known data gaps
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-4">
              <li>The official 2026 unsold list is not supplied, so unsold players are never presented as auction lots.</li>
              <li>2026 contract values come from the official auction and retention list; six fringe names cannot be matched to a statistics record and are excluded.</li>
              <li>The exact 2026 auction set list is not supplied; set labels are simulator-derived from role, capped status and reserve price.</li>
              <li>{report.players.verifiedImages} squad portraits and 10 franchise crests are synced from iplt20.com; unmatched or retired players fall back to branded initials.</li>
              <li>The 2027 mini auction uses a reported ₹130 crore purse and a 5/10/20 lakh increment table; neither has an official 2027 regulation PDF in this dataset.</li>
              <li>{players.missingBirthDate} players have no verified birth date and {players.missingNationality} have no recorded nationality.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-12 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="surface-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileWarning size={16} className="text-accent2" />
              <h2 className="font-display text-base font-bold uppercase tracking-wide">Import warnings</h2>
            </div>
            <span className="chip chip-gold">{report.latestImport?.warnings.length ?? 0} recorded</span>
          </div>
          {report.latestImport && report.latestImport.warnings.length > 0 ? (
            <ol className="mt-4 space-y-2">
              {report.latestImport.warnings.slice(0, 6).map((warning, index) => (
                <li key={`${warning}-${index}`} className="flex gap-2 text-xs leading-relaxed text-muted">
                  <span className="num shrink-0 text-faint">{String(index + 1).padStart(2, "0")}</span>
                  <span>{warning}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted">No warnings were recorded by the last import.</p>
          )}
          {report.latestImport && report.latestImport.warnings.length > 6 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-accent2">
                Show all {report.latestImport.warnings.length} warnings
              </summary>
              <ol className="mt-3 space-y-2">
                {report.latestImport.warnings.slice(6).map((warning, index) => (
                  <li key={`${warning}-${index + 6}`} className="flex gap-2 text-xs leading-relaxed text-muted">
                    <span className="num shrink-0 text-faint">{String(index + 7).padStart(2, "0")}</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <p className="mt-4 text-[0.65rem] leading-relaxed text-faint">
            Warnings are non-fatal reconciliation notes. The full audit is available in the downloaded JSON and in{" "}
            <code className="rounded bg-surface2 px-1.5 py-0.5">data/reports/import-report.json</code>.
          </p>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-accent2" />
              <h2 className="font-display text-base font-bold uppercase tracking-wide">Table inventory</h2>
            </div>
            <span className="chip">{report.tableCounts.length} tables</span>
          </div>
          <div className="mt-4 max-h-[360px] overflow-y-auto pr-1">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th className="text-right">Rows</th>
                </tr>
              </thead>
              <tbody>
                {report.tableCounts.map((table) => (
                  <tr key={table.table}>
                    <td className="font-mono text-[0.68rem]">{formatTableName(table.table)}</td>
                    <td className="num text-right">{table.rows.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2 border-t border-line pt-4 text-center">
            {[
              ["Sessions", report.auctionActivity.sessions],
              ["Lots", report.auctionActivity.lots],
              ["Bids", report.auctionActivity.bids],
              ["Events", report.auctionActivity.events],
              ["Ledger", report.auctionActivity.transactions],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="num font-display text-sm font-bold">{Number(value).toLocaleString("en-IN")}</p>
                <p className="text-[0.55rem] uppercase tracking-[0.1em] text-faint">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.65rem] leading-relaxed text-faint">
            Simulation activity appears here as you create auctions. Sessions are isolated by session ID and never alter the historical data.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <div className="panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display text-base font-bold uppercase tracking-wide">Audit the analysis</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              The rating methodology explains every input and shrinkage rule; the source register lists every licence and attribution.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/methodology" className="btn btn-outline btn-sm">
              Rating methodology <ArrowUpRight size={14} />
            </Link>
            <Link href="/sources" className="btn btn-outline btn-sm">
              Data sources <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
