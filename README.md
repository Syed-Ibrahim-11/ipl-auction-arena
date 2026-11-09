# IPL Auction Arena

A full-stack IPL auction simulator, season simulator and cricket analytics platform. Pick one of ten franchises, bid against nine AI managers, run Right to Match decisions, audit every rupee, then take your squad through a complete IPL 2026 season of lineups, tactics, ball-by-ball matches, playoffs, awards and a final champion.

> **Independent project.** This project is not affiliated with, endorsed by or connected to the BCCI, the Indian Premier League or any franchise. Team names and colours are used for identification only. No official logos, crests or player likenesses are reproduced. Ratings, match simulations and season results are this simulator's own outputs, not official records.

## Features

- **Four auction formats** with separate rulebooks, purses, pools and constraints.
- **Server-authoritative bidding** — every bid, sale, purse debit and RTM card is validated and written inside one SQLite transaction.
- **Real RTM sequence** — original-team invoke/decline, one final bidder raise, match/decline, card accounting and a full event trail.
- **Auction-room atmosphere** — a browser-synthesized auctioneer voice, quiet Web Audio effects, always-on captions, a call log and sold/unsold overlays. Nothing is downloaded or sent to a server; sound is off until you enable it.
- **Complete post-auction season** — choose your XI, captain, wicketkeeper and batting order, set tactics, play (or simulate) all 74 fixtures, follow the table and NRR, then contest seeded playoffs, the final and the awards.
- **Deterministic ball-by-ball engine** — 20 overs, ten wickets, four-over bowling limits, extras, free hits, super overs, home advantage and venue scoring bands, with full scorecards and commentary.
- **Explainable ratings** — role-weighted OVR from Cricsheet IPL evidence with a visible evidence quality grade and no post-cutoff leakage.
- **Current-player pool only** — current-player surfaces use the 237 players with a 2026 IPL appearance or a verified 2026 sale; players with no current IPL involvement are excluded.
- **Player explorer, comparison, franchise dashboards and printable team sheets.**
- **Evidence-based AI analyst** — works with an OpenAI-compatible provider when configured, and falls back to a deterministic, server-side evidence engine when it is not.
- **Saved rooms** — every session is resumable; completed rooms have a recap, ledger reconciliation, CSV exports and print styles.
- **Data-quality admin** — import reconciliation, rating coverage, integrity checks and source attribution.
- **Responsive dark/classic themes**, reduced-motion support, visible focus states, a skip link and true 404 responses.

## Quick start

Requirements: Node.js 20+ (tested on Node 24), npm and a working native build toolchain for `better-sqlite3`.

```bash
npm install
npm run import-data
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The import builds `data/ipl-arena.db` from the supplied sources and writes an audit report to `data/reports/`. A pre-built database is included in this folder, so `npm run dev` also works without re-importing.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run import-data` | Rebuild `data/ipl-arena.db` from `data/sources/` (wipes saved sessions) |
| `npm test` | Unit and integration tests in isolated temporary databases |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint |

## Auction formats

| Mode | Rulebook | Pool | Purse | RTM |
| --- | --- | --- | --- | --- |
| 2026 Replay Sprint | 2026 mini | 77 supplied sold players | ₹125 Cr | Off |
| 2026 Mini Auction | 2026 mini | 77 supplied sold players + simulated retained squads | ₹125 Cr less simulated retention | Off |
| 2026 Open Mega Draft | 2026 mini | Full 237-player current pool | ₹125 Cr | Off |
| 2025 RTM Lab | 2025 mega practice | Full 237-player current pool | ₹120 Cr | 6 cards |

The 2025 RTM Lab applies the verified 2025 mega-auction RTM procedure to the current player pool. It is a practice format, not a recreation of the 2025 results. The unpublished 2027 rulebook is displayed for transparency but cannot be simulated.

## Post-auction season

Starting a season moves the auction into a separate, resumable competition:

- **Schedule.** League dates, venues and pairings follow the 74-match 2026 archive in this workspace (70 league fixtures plus four playoff slots). The master prompt's own `fixtures.csv` attachment was not supplied, so this archive is the schedule template. Home and away are inferred from venue cities where the archive does not state them; matchweeks are a simulator grouping, not an official IPL label. Playoff dates and venues come from the 2026 archive, but the playoff teams are seeded from your simulated league table.
- **Ownership.** You control your franchise's XI, captain, wicketkeeper, batting order, batting aggression and bowling aggression. Nine AI owners pick their own XIs and tactics. The season auto-pauses for your next match until you are ready.
- **Squads.** Only auction and retention players are used. If an AI squad is short of a keeper, seven domestic players or eleven players, the simulator adds clearly labelled zero-fee call-ups from the current-player pool rather than inventing players. The app refuses to start a season if the pool cannot field an XI.
- **Matches.** The deterministic engine models 20 overs, ten wickets, four-over bowling limits, extras, free hits, home advantage and venue bands. Bowlers are selected by role and over quotas; keepers and fielders are credited with the correct dismissals. Every legal ball is stored for the scorecard and commentary.
- **Competition.** The league table uses points and net run rate. The top four enter Qualifier 1, Eliminator, Qualifier 2 and the Final in seeded order. The season then produces a champion, runner-up, Orange Cap, Purple Cap, Most Valuable Player and other awards from simulated scorecards.

Season results are simulations, not predictions or official records. Ratings and AI decisions never read the real 2026 auction outcomes.

## Data and provenance

| Source | Use | Licence / status |
| --- | --- | --- |
| [Cricsheet](https://cricsheet.org/) IPL ball-by-ball archive | Matches, deliveries, career and season statistics, 2024–2026 ratings | ODC-BY 1.0 |
| [openIPL](https://github.com/) 2026 season tables | 2026 appearances, roles, squads and match metadata | Data CC BY 4.0, code MIT |
| Supplied `IPL_Auction_2026_Sold_Player.csv` | 77 confirmed 2026 sales, base prices and buyers | User-supplied dataset |
| Wikidata cache | Select player identity metadata | CC0 |

Current import: **834 players, 1,243 matches, 295,557 deliveries, 814 career stat rows, 77 auction players, 2,331 rating versions.** The current-player pool is **237 players**: anyone with a 2026 IPL match appearance or a verified 2026 auction sale. The 2026 schedule archive supplies **74 fixtures** (70 league, 4 playoff slots).

### Current-player filtering and role evidence

- Surface-level player lists, comparisons, team sheets, auction pools and season squads are restricted to the 237-player current pool. Historical-only players remain in the database for ratings and source transparency but are not offered as current IPL options.
- Wicketkeepers are identified from **Cricsheet stumpings** first, because openIPL's coarse labels classify keeper-batters as plain batters. The import records the derivation source (`derived_cricsheet_stumpings`, `openipl_2026` or inferred) beside each role; the app never invents a keeper when the evidence is absent.

### Known data gaps — deliberately not filled

- The supplied auction file contains **77 sold players only**; there is no official unsold list or full 2026 set list. Unsold players are not presented as verified lots.
- **Retention contract values are not supplied.** Mini-auction retained squads and their charges are clearly labelled simulator estimates.
- The 2026 auction purse, 2026 bid increments and the 2027 rulebook are not fully verified in an official regulation PDF. The UI labels reported vs verified values and never simulates 2027.
- Player photographs are not licensed. The app uses original illustrated fallbacks with explicit alt text.

Full source-level notes appear on `/sources`, `/methodology`, `/rulebook` and the admin report.

## Ratings and auction separation

Ratings are computed from IPL evidence up to a season cutoff (`2024`, `2025` or `2026`, depending on mode). Each rating stores its formula version, sample, evidence quality and role weights. Auction prices, results and AI valuations are never inputs to a rating. In auction modes the ratings use a 2025 cutoff, so the 2026 auction outcome cannot leak into bidding; the real 2026 buyer unlocks only after a lot is resolved.

The AI managers value players from that pre-auction evidence, squad needs, purse reserve and a deterministic seeded jitter. They do not read the actual 2026 winning bid.

## AI analyst

`POST /api/analyst` accepts up to three player IDs and an optional question.

- **With a provider:** set `ANALYST_API_BASE_URL` (OpenAI-compatible base URL), `ANALYST_API_KEY` and optionally `ANALYST_MODEL`. These are server-side variables and must never use a `NEXT_PUBLIC_` prefix.
- **Without a provider:** the route returns a deterministic brief from the server-side evidence engine, clearly labelled as such. No network call and no fabricated statistics.
- Provider responses are grounded in the same evidence payload and fall back to the local brief on timeout, error or low-quality output.

## Architecture

```
src/app/                    Routes, API handlers, metadata and OG images
src/components/             UI, auction room, auctioneer, brands, charts and print controls
src/components/season/      Season hub, match centre, lineup editor, API client
src/lib/auction/            Pool, retention, valuation, engine, RTM, snapshots, recap, calls/sfx/speech
src/lib/season/             Schedule builder, ball-by-ball engine, standings, commentary, awards, service
src/lib/ratings.ts          Role-weighted rating formula
src/lib/rules.ts            Verified/pending rulebooks and increments
src/lib/analyst.ts          Evidence engine + optional provider call
src/db/schema.ts            SQLite schema (FKs, integer lakh, audit tables)
scripts/import-data.ts      Cricsheet/openIPL/auction/Wikidata import + report
tests/                       Unit tests, auction integration tests and season engine tests
```

Money is stored as integer lakh everywhere. Auction actions run in `IMMEDIATE` SQLite transactions with foreign keys enabled. Sales, purse movement, squad insertion, transactions, events and lot completion are atomic; the winner's limits are re-checked inside the transaction.

Key APIs:

- `GET/POST /api/sessions`
- `GET/DELETE /api/sessions/:id`
- `POST /api/sessions/:id/actions` (`tick`, `bid`, RTM actions)
- `GET /api/sessions/:id/export?type=results|squad|team-sheet|events`
- `GET/POST /api/sessions/:id/season` (season snapshot / start)
- `GET /api/sessions/:id/season/match/:fixtureId` (scorecard)
- `POST /api/sessions/:id/season/actions` (start match, simulate, advance, lineup, tactics)
- `POST /api/analyst`
- `GET /api/admin/report`

## Testing and checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The suite uses a synthetic fixture database in a temporary directory, never the production database. Integration tests cover bid increment enforcement, atomic sales, purse/squad/overseas limits, RTM invoke/raise/match/decline, card accounting, deal completion, session abandonment and lobby filtering. Season tests cover the ball-by-ball engine, scorecard consistency and awards; auctioneer tests cover spoken prices and the generated calls for open, bid, going once/twice, sold, unsold and RTM states. **There are 27 tests in total.**

The production build has been checked with `next start`: every public route returns 200, unknown player, team and auction URLs return 404, invalid API payloads return 400/409, CSV exports return `text/csv`, and security headers are present. The auction room, auctioneer captions/sold overlay, lineup editor, live match, season completion and champion state were additionally exercised through the browser accessibility tree. Visual screenshot verification is not available in this environment.

## Deployment

Set these server-side variables as needed:

| Variable | Purpose |
| --- | --- |
| `IPL_DB_PATH` | Absolute path to a SQLite database. Defaults to `data/ipl-arena.db`. |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL used for metadata and Open Graph. |
| `ANALYST_API_BASE_URL` | Optional OpenAI-compatible provider base URL. |
| `ANALYST_API_KEY` | Provider secret. Server-side only. |
| `ANALYST_MODEL` | Optional model name; defaults to `gpt-4o-mini`. |

```bash
npm run build
npm run start
```

SQLite requires a persistent filesystem. Rebuild the database with `npm run import-data` after changing supplied data.

## Limitations

- Replay Sprint is a 77-lot short format; squads cannot reach the real 18-player minimum, and the app reports that shortfall honestly.
- Mega Draft and RTM Lab include modelled base prices for players outside the 77 verified auction rows.
- AI managers are deterministic heuristic opponents, not LLM agents and not reproductions of real franchise strategy.
- **Single-player only.** There is no authentication, real-time multiplayer or shared server. You control one franchise; nine AI owners run the rest. Sessions, seasons and lineups live in the local SQLite database on this device.
- **Schedule provenance.** The schedule is the workspace's 2026 Cricsheet/openIPL match archive; the master prompt's fixture attachment was not supplied. Home/away inference and simulator matchweeks are labelled in the app, and playoff qualification is simulated rather than copied from the real tournament.
- **Season simulation.** Results, tables, awards and the champion are deterministic simulations from ratings and tactics. They are not forecasts, official records or real 2026 outcomes.
- The 2026 bid-increment table is a documented custom rule because no official table was located. The 2025 table is verified.
- The auctioneer uses the browser's local speech engine. Voice availability and accent depend on the device; captions and synthesized effects work regardless, and no audio is streamed.

## Attribution

Ball-by-ball data: Cricsheet (ODC-BY 1.0). 2026 season tables, schedule and match metadata: openIPL (data CC BY 4.0, code MIT). Auction prices: supplied 2026 sold-player list. Ratings, logos, crests, illustrations, auctioneer voice lines and sound effects are original to this independent project. See `/sources`, `/privacy` and `/terms` for the in-app notices.
