import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Ban, BookOpen, Gavel, Scale, ShieldAlert, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "Plain-language terms for using IPL Auction Arena: a free, independent cricket auction simulator and analytics project, not an official or betting service.",
};

const LAST_UPDATED = "25 October 2026";

const HIGHLIGHTS = [
  {
    icon: Gavel,
    title: "It is a simulation",
    body: "Auction outcomes, squad decisions and ratings are analytical game content — not official IPL records or predictions.",
  },
  {
    icon: Ban,
    title: "No gambling",
    body: "The project offers no wagering, real-money prizes, tips or financial products, and must not be used to operate them.",
  },
  {
    icon: Scale,
    title: "Open data, original app",
    body: "Upstream data keeps its own licence. The application code, branding and written analysis are this project's work.",
  },
  {
    icon: ShieldAlert,
    title: "Use it honestly",
    body: "Do not present the simulator as an official BCCI or IPL product, or use it to mislead other people.",
  },
];

function Clause({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`clause-${number}`} className="scroll-mt-28 border-t border-line py-7">
      <div className="flex gap-3">
        <span className="num mt-0.5 shrink-0 font-display text-sm font-bold text-accent2">{number.padStart(2, "0")}</span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">{title}</h2>
          <div className="mt-2 max-w-3xl space-y-3 text-sm leading-relaxed text-muted">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Terms of use"
        title="The house rules"
        description="A plain-language agreement for using this independent simulator. It is intentionally short, specific and free of invented legal entities."
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip">Last updated {LAST_UPDATED}</span>
            <span className="chip chip-gold">Not an official IPL product</span>
            <span className="chip chip-success">Free to explore</span>
          </div>
        }
        actions={
          <Link href="/privacy" className="btn btn-outline">
            Privacy notice <ArrowUpRight size={14} />
          </Link>
        }
      />

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {HIGHLIGHTS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="surface-card p-5">
              <Icon size={19} className="text-accent2" />
              <p className="mt-3 font-display text-sm font-bold uppercase tracking-wide">{item.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.body}</p>
            </div>
          );
        })}
      </section>

      <div className="mt-10">
        <Clause number="1" title="Agreement and operator">
          <p>
            By using IPL Auction Arena (the &ldquo;app&rdquo;, &ldquo;simulator&rdquo; or &ldquo;project&rdquo;), you agree
            to these terms. The app is an independent, self-hostable software project. The person or organisation hosting
            the instance you are using is its operator and is responsible for that deployment.
          </p>
          <p>
            These are plain-language terms, not legal advice. If you do not agree with them, do not use the app. If you
            access the app on behalf of an organisation, you confirm you have authority to accept them for that
            organisation.
          </p>
        </Clause>

        <Clause number="2" title="What the service is">
          <p>
            The app is a sports simulation and analytics tool. It lets you create and play fictional IPL auction
            scenarios, inspect analytical player and team ratings, compare players and generate evidence-based reports.
          </p>
          <p>
            Simulated budgets, retention charges, base prices in practice modes, AI decisions and final squads are game
            state. They are not statements about what any real franchise would or should do.
          </p>
          <p>
            The app is not a betting, fantasy-sports, investment, scouting or prediction service. It does not accept
            stakes, pay prizes or provide tips intended for wagering.
          </p>
        </Clause>

        <Clause number="3" title="No affiliation with the IPL or BCCI">
          <p>
            The project is not affiliated with, endorsed by, sponsored by or connected to the Board of Control for
            Cricket in India (BCCI), the Indian Premier League (IPL), any franchise, player, broadcaster or governing
            body. &ldquo;IPL&rdquo; and team names are used descriptively for identification only.
          </p>
          <p>
            Franchise crests and player portraits are retrieved from iplt20.com and remain the property of their respective
            owners; they are shown here for identification in a non-commercial simulator. Trophy images, broadcast
            footage and audio are not reproduced. Team colours and names may resemble real franchises because they
            identify the subject of the simulation. Nothing in the app grants you a licence to use any third-party
            trade mark.
          </p>
          <p>
            Do not describe the app or its output as official, approved, endorsed or produced by the BCCI or IPL. Do not
            use it to impersonate an official source.
          </p>
        </Clause>

        <Clause number="4" title="Access, sessions and no account security">
          <p>
            The app has no user accounts and no authentication. Saved auction sessions are available to anyone who can
            reach the deployment and know or discover a session identifier; summaries are listed in the Auction Lobby.
            Do not create auction names containing personal, confidential or sensitive information.
          </p>
          <p>
            You are responsible for your own use of the app. If you deploy it publicly, you are responsible for adding
            the access controls, backups and security measures appropriate to your environment. The software is provided
            as a local-first project and does not claim to be a hardened multi-tenant service.
          </p>
        </Clause>

        <Clause number="5" title="Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>attack, overload, probe or attempt to gain unauthorised access to the deployment or its database;</li>
            <li>submit malicious code, injection payloads or automated traffic that degrades the service for others;</li>
            <li>scrape or bulk-extract data in a way that imposes an unreasonable load or violates an upstream licence;</li>
            <li>misrepresent the app as official, affiliated or endorsed by the BCCI, IPL or any franchise;</li>
            <li>use the app for unlawful discrimination, harassment, fraud, gambling operations or misleading commercial claims;</li>
            <li>upload or enter content that is illegal, infringing, private or harmful to another person.</li>
          </ul>
          <p>
            The operator may suspend or remove access, sessions or content to protect the deployment or comply with
            applicable law.
          </p>
        </Clause>

        <Clause number="6" title="Data, ratings and intellectual property">
          <p>
            Upstream data keeps its own licence: Cricsheet ball-by-ball data is ODC-BY 1.0, openIPL data is CC BY 4.0
            and its code MIT, and Wikidata enrichment is CC0 1.0. Attribution is recorded on the{" "}
            <Link href="/sources" className="font-semibold text-accent2 hover:underline">
              data sources
            </Link>{" "}
            page. The supplied 2026 auction list has no public upstream licence and should not be redistributed without
            checking its provenance.
          </p>
          <p>
            The application&apos;s original code, written analysis, interface design, logo, badges and player fallbacks are
            the project&apos;s own work. You may read, run and modify the project as permitted by the licences shipped with
            its dependencies and source files. No licence is granted for third-party names, marks or data beyond what
            their owners and upstream licences allow.
          </p>
          <p>
            Ratings, team-strength metrics and AI reports are this project&apos;s analytical opinions, produced by a
            documented model. They are not official ratings, verified scouting assessments or guarantees of player
            performance.
          </p>
        </Clause>

        <Clause number="7" title="AI-generated content">
          <p>
            Analytical reports may be produced by a deterministic local evidence engine or, if the operator configures a
            provider, by a third-party language model. AI output can be incomplete, outdated or wrong. You must check it
            against the evidence shown in the report and against the primary sources before relying on it.
          </p>
          <p>
            AI reports are not professional, legal, financial, medical, betting or selection advice. The operator controls
            whether an external model provider is enabled. Provider usage is subject to that provider&apos;s terms.
          </p>
        </Clause>

        <Clause number="8" title="Availability, accuracy and changes">
          <p>
            The app is provided free of charge and without a service-level agreement. The operator may change, reset or
            withdraw the deployment, its data or its features at any time. Saved sessions may be lost when the database
            is rebuilt, moved or deleted. Export or print a team sheet if you want a personal copy.
          </p>
          <p>
            Data may be incomplete. The supplied auction file covers sold players only, reflects a particular snapshot
            and may contain upstream errors. Estimated salaries, the 2027 purse and bid increments are labelled as such.
            The app marks these gaps; it does not promise a complete historical or official record.
          </p>
        </Clause>

        <Clause number="9" title="Disclaimer of warranties">
          <p>
            To the fullest extent permitted by applicable law, the app and all content are provided &ldquo;as is&rdquo;
            and &ldquo;as available&rdquo;, without warranties of any kind, express or implied, including fitness for a
            particular purpose, accuracy, non-infringement, availability or freedom from errors. Nothing in these terms
            excludes a warranty or right that applicable law does not allow to be excluded.
          </p>
        </Clause>

        <Clause number="10" title="Limitation of liability">
          <p>
            To the fullest extent permitted by law, the operator and contributors are not liable for indirect, incidental,
            special, consequential or punitive loss, or for lost data, profits, opportunities or reputation, arising from
            your use of or inability to use the app. Where liability cannot be excluded, it is limited to the amount, if
            any, you paid the operator to use the app.
          </p>
          <p>
            Nothing here limits liability for fraud, wilful misconduct or any liability that applicable law does not
            permit to be limited.
          </p>
        </Clause>

        <Clause number="11" title="Changes to these terms">
          <p>
            The terms may be updated as the software or the operator&apos;s data practices change. The date at the top of
            this page identifies the current version. Continued use after an update means you accept the revised terms.
            If a material change affects data handling, the{" "}
            <Link href="/privacy" className="font-semibold text-accent2 hover:underline">
              privacy notice
            </Link>{" "}
            is updated too.
          </p>
        </Clause>

        <Clause number="12" title="General">
          <p>
            If a provision is found unenforceable, the remaining provisions stay in effect. A failure to enforce a
            provision is not a waiver. These terms are the entire agreement between you and the operator regarding use of
            the app, except where applicable law grants you additional rights.
          </p>
          <p>
            Questions about a specific deployment should be directed to its operator. Questions about cricket data should
            reference the upstream source listed in the{" "}
            <Link href="/sources" className="font-semibold text-accent2 hover:underline">
              source register
            </Link>
            .
          </p>
        </Clause>
      </div>

      <div className="mt-6 panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-gold" />
          <p className="max-w-2xl text-xs leading-relaxed text-muted">
            Short version: play the auction, audit the numbers, credit the data, do not pretend it is official and do not
            use it for betting. For the rules the simulator follows, read the{" "}
            <Link href="/rulebook" className="font-semibold text-accent2 hover:underline">
              rulebook
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/privacy" className="btn btn-outline btn-sm">
            Privacy
          </Link>
          <Link href="/about" className="btn btn-outline btn-sm">
            <BookOpen size={14} /> About
          </Link>
        </div>
      </div>
    </div>
  );
}
