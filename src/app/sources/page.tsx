import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Database,
  Image as ImageIcon,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/ui";
import { getQualityReport } from "@/lib/data/quality";
import { RULEBOOKS } from "@/lib/rules";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Sources",
  description:
    "Every dataset, licence, attribution and rule source behind IPL Auction Arena — Cricsheet, openIPL, the supplied 2026 auction list, Wikidata and official IPL regulations.",
};

const LICENSE_LINKS = [
  {
    label: "Open Data Commons Attribution License 1.0",
    href: "https://opendatacommons.org/licenses/by/1-0/",
  },
  {
    label: "Creative Commons Attribution 4.0",
    href: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    label: "Creative Commons CC0 1.0",
    href: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    label: "MIT License",
    href: "https://opensource.org/license/mit",
  },
  {
    label: "SIL Open Font License 1.1",
    href: "https://openfontlicense.org/",
  },
];

export default function SourcesPage() {
  const report = getQualityReport();
  const dataCutoff = report.dataCutoff;
  const ruleSources = RULEBOOKS.flatMap((rulebook) =>
    rulebook.sources.map((source) => ({ ...source, rulebook: `${rulebook.season} · ${rulebook.name}` })),
  );
  const seen = new Set<string>();
  const uniqueRuleSources = ruleSources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });

  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Provenance & licensing"
        title="Data sources"
        description="This project is built from open cricket data and one supplied auction file. This page records what was used, under which licence, and what was deliberately not invented."
        actions={
          <>
            <Link href="/api/admin/report" className="btn btn-primary">
              Download audit JSON <ArrowDownToLine size={15} />
            </Link>
            <Link href="/admin" className="btn btn-outline">
              Data quality
            </Link>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-success">Open licences recorded</span>
            <span className="chip">Data cut-off {dataCutoff ?? "unknown"}</span>
            <span className="chip chip-gold">No player photographs</span>
            <span className="chip">Independent project</span>
          </div>
        }
      />

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Database,
            title: "Data",
            body: "Ball-by-ball history, 2026 season metadata and the supplied auction list are stored separately. Auction outcomes never enter the rating formula.",
          },
          {
            icon: Scale,
            title: "Licensing",
            body: "Every open dataset is attributed with its upstream licence. The supplied auction CSV has no public licence, so it is treated strictly as project input.",
          },
          {
            icon: ShieldCheck,
            title: "Honesty",
            body: "Missing values stay missing. There is no fabricated unsold list, retention value, photograph, 2027 rule or future match result anywhere in the product.",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="surface-card p-5">
              <Icon size={20} className="text-accent2" />
              <p className="mt-3 font-display text-base font-bold uppercase tracking-wide">{item.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.body}</p>
            </div>
          );
        })}
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="Dataset register"
          title="What the database is made of"
          description="Record counts are read live from the shipped build, not copied from a report."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {report.sources.map((source) => (
            <article key={source.id} className="surface-card flex flex-col p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-bold uppercase leading-tight tracking-wide">{source.name}</p>
                  <p className="mt-1 text-[0.68rem] text-faint">
                    Retrieved {source.retrievedAt ?? "not recorded"} · {source.recordCount?.toLocaleString("en-IN") ?? "?"} records
                  </p>
                </div>
                <span className="chip chip-success">{source.license ?? "Licence unrecorded"}</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">{source.notes}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3 text-[0.65rem] text-faint">
                <span>Attribution: {source.attribution ?? "Not recorded"}</span>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-accent2 hover:underline"
                  >
                    Upstream source <ArrowUpRight size={12} />
                  </a>
                ) : (
                  <span className="chip">Supplied file · no public URL</span>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="panel mt-4 p-4 text-[0.68rem] leading-relaxed text-muted">
          The 2026 sold-player dataset was supplied with the project brief. It is not an official BCCI publication and its
          provenance should be confirmed before redistribution. Auction prices and buyers are displayed as supplied, never
          adjusted to fit the rating model.
        </div>
        <div className="panel mt-4 p-4 text-[0.68rem] leading-relaxed text-muted">
          <span className="font-semibold text-fg">Season schedule provenance.</span> The project brief referred to a{" "}
          <code className="rounded bg-surface2 px-1 py-0.5 text-[0.65rem]">fixtures.csv</code> attachment, but that file was
          not supplied. The 2026 season therefore uses the dates, venues and pairings present in the Cricsheet/openIPL 2026
          match archive: 70 league fixtures plus four playoff slots. Where the archive does not state a home side, home
          advantage is inferred from the venue; the playoff bracket is seeded from each simulated league table. These are
          simulator fixtures, not a claim about the official 2026 schedule.
        </div>
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="Rules research"
          title="Official and reported auction sources"
          description="Rulebook claims are tagged verified, verified with gaps, or pending. Media-only reports are labelled as reported, never as regulations."
        />
        <div className="surface-card mt-6 overflow-hidden">
          <ul className="divide-y divide-line/70">
            {uniqueRuleSources.map((source) => (
              <li key={source.url} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{source.label}</p>
                  <p className="mt-1 text-[0.65rem] uppercase tracking-[0.12em] text-faint">
                    {source.rulebook}
                    {source.published ? ` · published ${source.published}` : " · date not recorded"}
                  </p>
                  {source.note && <p className="mt-1.5 text-xs leading-relaxed text-muted">{source.note}</p>}
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-[0.68rem] font-semibold text-accent2 hover:underline"
                >
                  Open <ArrowUpRight size={12} />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/rulebook" className="btn btn-outline btn-sm">
            <BookOpen size={14} /> Read the rulebook
          </Link>
          <Link href="/methodology" className="btn btn-outline btn-sm">
            <CheckCircle2 size={14} /> Rating methodology
          </Link>
        </div>
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <SectionHeading eyebrow="Licence summary" title="Rights and attribution" />
          <div className="surface-card mt-6 overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Licence</th>
                  <th>Attribution</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Ball-by-ball IPL archive</td>
                  <td>ODC-BY 1.0</td>
                  <td>Cricsheet and contributors</td>
                </tr>
                <tr>
                  <td>2026 season metadata</td>
                  <td>Data CC BY 4.0 · code MIT</td>
                  <td>openIPL contributors</td>
                </tr>
                <tr>
                  <td>Player enrichment</td>
                  <td>CC0 1.0</td>
                  <td>Wikidata contributors</td>
                </tr>
                <tr>
                  <td>2026 auction list</td>
                  <td>Supplied dataset</td>
                  <td>Project brief · upstream unverified</td>
                </tr>
                <tr>
                  <td>Interface typefaces</td>
                  <td>SIL OFL 1.1</td>
                  <td>Barlow Condensed · Inter</td>
                </tr>
                <tr>
                  <td>Franchise crests and player portraits</td>
                  <td>No open licence · identification use</td>
                  <td>iplt20.com · respective franchise and player owners</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[0.65rem] leading-relaxed text-faint">
            This page is an attribution record, not legal advice. Reusers should verify each upstream licence before
            redistributing derived data.
          </p>
        </div>

        <div>
          <SectionHeading eyebrow="Assets" title="Images, type and code" />
          <div className="mt-6 space-y-3">
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ImageIcon size={15} className="text-accent2" /> Stadium hero artwork
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                The floodlit stadium backdrop is an AI-generated illustration created for this project. It is not a
                photograph of any real IPL venue and does not depict real players, teams or broadcast marks.
              </p>
            </div>
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles size={15} className="text-accent2" /> Brand and player imagery
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                The site mark and interface are original work. Franchise crests and {report.players.verifiedImages}{" "}
                player portraits are retrieved from the public IPL team pages on iplt20.com and remain the property of
                their respective owners; they are used here for identification in an independent, non-commercial
                simulator, not under an open licence. Trophy and broadcast imagery is not reproduced. Players without
                a matched official portrait use an illustrated fallback.
              </p>
            </div>
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Database size={15} className="text-accent2" /> Open-source software
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                Built with Next.js and React (MIT), better-sqlite3 (MIT), Tailwind CSS (MIT) and lucide icons (ISC).
                Package versions and licences are listed in the project lockfile and upstream packages.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-14">
        <div className="panel p-5">
          <p className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide">
            <Scale size={16} className="text-accent2" /> Licence reference
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {LICENSE_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent2 hover:underline"
                >
                  {link.label} <ArrowUpRight size={12} />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.65rem] leading-relaxed text-faint">
            IPL Auction Arena is an independent simulator. It is not affiliated with, endorsed by or connected to the
            BCCI, the Indian Premier League or any franchise. Team names, colours, crests and player portraits are used
            for identification only; crests and portraits are retrieved from iplt20.com and remain the property of their
            respective owners.
          </p>
        </div>
      </section>
    </div>
  );
}
