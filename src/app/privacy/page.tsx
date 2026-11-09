import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Database, EyeOff, KeyRound, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What IPL Auction Arena stores, what it does not collect, how the local auctioneer behaves, how optional voice notes use your microphone, and how to remove saved auction data.",
};

const LAST_UPDATED = "25 October 2026";

const GLANCE = [
  {
    icon: EyeOff,
    title: "No accounts",
    body: "There is no sign-up, email address, password or advertising identifier anywhere in the app.",
  },
  {
    icon: MonitorSmartphone,
    title: "Two local preferences",
    body: "Theme and auctioneer sound choices are saved in local storage. Neither reaches the server.",
  },
  {
    icon: Database,
    title: "Simulation records",
    body: "Auction names, bids, picks and events are stored in the deployment's SQLite database.",
  },
  {
    icon: KeyRound,
    title: "Secrets stay server-side",
    body: "Any model-provider key is read from server environment variables only and never sent to the browser.",
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className="font-display text-xl font-bold uppercase tracking-wide">{title}</h2>
      <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <PageHeader
        eyebrow="Privacy"
        title="What this app knows"
        description="A short, specific account of the data this project handles. No dark patterns, no advertising, no hidden analytics."
        meta={
          <div className="flex flex-wrap gap-2">
            <span className="chip">Last updated {LAST_UPDATED}</span>
            <span className="chip chip-success">No trackers</span>
            <span className="chip">No accounts</span>
          </div>
        }
        actions={
          <Link href="/terms" className="btn btn-outline">
            Terms of use <ArrowUpRight size={14} />
          </Link>
        }
      />

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {GLANCE.map((item) => {
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
        <Section title="Who runs this deployment">
          <p>
            IPL Auction Arena is an independent, self-hostable project. The person or organisation hosting the instance
            you are using is the operator of that instance. This page describes the software&apos;s behaviour; the
            operator may also receive standard web-server metadata such as IP address, browser user agent, requested URL
            and timestamp through their hosting provider.
          </p>
          <p>
            Because the app has no user accounts, the operator cannot look up &ldquo;your&rdquo; records by identity. Any
            privacy request should go to the operator of the deployment you are using.
          </p>
        </Section>

        <Section title="What is deliberately not collected">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>No names, email addresses, phone numbers, passwords or payment details.</li>
            <li>No account profiles, social logins or contact forms.</li>
            <li>No advertising identifiers, cross-site cookies, fingerprinting or session-replay tools.</li>
            <li>No third-party analytics scripts. The project ships without an analytics package.</li>
            <li>No precise location requests.</li>
          </ul>
        </Section>

        <Section title="Browser storage">
          <p>
            The app uses two local-storage keys, both of which stay on your device.{" "}
            <code className="rounded bg-surface2 px-1.5 py-0.5 text-[0.75rem]">arena-theme</code> remembers whether you
            chose the dark or Classic theme and contains the value{" "}
            <code className="rounded bg-surface2 px-1.5 py-0.5 text-[0.75rem]">dark</code> or{" "}
            <code className="rounded bg-surface2 px-1.5 py-0.5 text-[0.75rem]">classic</code>.{" "}
            <code className="rounded bg-surface2 px-1.5 py-0.5 text-[0.75rem]">ipl-arena:auction-sound</code> remembers
            whether you enabled the optional auctioneer and contains{" "}
            <code className="rounded bg-surface2 px-1.5 py-0.5 text-[0.75rem]">on</code> or{" "}
            <code className="rounded bg-surface2 px-1.5 py-0.5 text-[0.75rem]">off</code>. Neither value is transmitted
            to the server. Clearing site data removes both; the app then falls back to the dark theme and the default
            auctioneer setting.
          </p>
          <p>No cookies are set by the application for identity, advertising or analytics.</p>
        </Section>

        <Section title="Auctioneer voice and sound">
          <p>
            The auctioneer is optional and off by default. Its calls are generated in your browser from the auction state
            already shown on screen. Speech uses the browser&apos;s Web Speech API and whichever English voices your
            operating system provides; bid and sale effects are synthesised locally with the Web Audio API. No audio is
            recorded, uploaded or sent to a server, and no third-party voice or media service is contacted.
          </p>
          <p>
            Captions and a transcript mirror every call, so sound is never required to follow the room. The transcript is
            held in memory for the current visit and is not written to local storage or the database. Voice availability,
            accent and quality depend on your browser and operating system, not on this project.
          </p>
        </Section>

        <Section title="Auction simulations">
          <p>
            When you create an auction, the server stores the session name you provide, the selected mode, your franchise,
            every bid and RTM decision, squad composition, purse movements, timestamps and generated event messages in a
            SQLite database. This is necessary to make the auction server-authoritative, resumable and auditable.
          </p>
          <p>
            If you launch the post-auction season, the server also stores the generated 74-fixture schedule, your lineups
            and tactics, every simulated scorecard, the league table, playoff results and season awards. This keeps the
            season resumable, auditable and consistent across visits.
          </p>
          <p>
            Session summaries &mdash; including the auction name, your chosen franchise and progress &mdash; are listed in
            the public Auction Lobby of that deployment. The session identifier is a random UUID, but the app has no login
            or access control. Treat every session as visible to anyone who can reach the deployment, and do not put
            personal or sensitive information in an auction name.
          </p>
          <p>
            Abandoned auctions are removed from the lobby but retained in the database for audit history. Completed and
            active sessions persist until the operator rebuilds or deletes the database. There is no in-app delete button;
            removal is an operator action on the database.
          </p>
        </Section>

        <Section title="Voice notes and microphone">
          <p>
            Voice notes are optional and only start after you press the microphone button and grant your browser&rsquo;s
            microphone permission. Nothing is captured before that prompt is accepted, and the permission can be revoked
            at any time in your browser settings. Short clips are uploaded to the room&rsquo;s database so other members of
            that private auction can play them back, then they expire with the room. They are never sent to a third-party
            AI or advertising service.
          </p>
          <p>
            Microphone access requires a secure context: the site must be served over HTTPS or from localhost. If the
            browser blocks the request, the chat shows a clear &ldquo;microphone blocked&rdquo; state with instructions
            to re-enable it from the address-bar permissions icon.
          </p>
        </Section>

        <Section title="Server logs and errors">
          <p>
            Application code logs errors without request bodies. Typical entries contain an error description and stack
            information. Your hosting provider or reverse proxy may keep access logs containing IP address, user agent,
            path and response status. Those logs are controlled by the operator, not by the application database.
          </p>
        </Section>

        <Section title="Third-party links and services">
          <p>
            The rulebook and sources pages link to external sites such as iplt20.com, ESPNcricinfo, Sportstar, The Hindu,
            Cricsheet, Wikidata and GitHub. Opening those links is subject to those sites&apos; privacy policies. The app
            does not embed their trackers or load their scripts.
          </p>
        </Section>

        <Section title="Children and sensitive data">
          <p>
            The project is a sports simulation and analytics tool intended for a general cricket-interested audience. It
            is not directed at young children and does not knowingly collect any personal data from anyone. Do not enter
            personal, medical, financial or other sensitive information into auction names, chat messages or voice notes.
          </p>
        </Section>

        <Section title="Changes to this notice">
          <p>
            This notice is tied to the software build. If data handling changes &mdash; for example, if accounts or a new
            third-party service are added &mdash; this page must be updated before that feature ships. The date at the top
            records the current version.
          </p>
        </Section>
      </div>

      <div className="mt-4 panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent2" />
          <p className="max-w-2xl text-xs leading-relaxed text-muted">
            The source and database design are auditable. The{" "}
            <Link href="/sources" className="font-semibold text-accent2 hover:underline">
              source register
            </Link>{" "}
            lists data provenance, and the{" "}
            <Link href="/admin" className="font-semibold text-accent2 hover:underline">
              data quality dashboard
            </Link>{" "}
            shows live record counts and integrity checks.
          </p>
        </div>
        <Link href="/terms" className="btn btn-outline btn-sm shrink-0">
          Read the terms <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}
