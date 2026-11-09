import { getDb } from "@/db";
import { brandAssetCoverage } from "@/lib/brand-assets";
import { parseJson } from "./queries";

type Scalar = { n: number | null };

export interface ImportRunRecord {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  warningsCount: number;
  errorsCount: number;
  warnings: string[];
  report: {
    schemaVersion?: string;
    ratingFormulaVersion?: string;
    ratingSeasons?: number[];
    auctionOnlyPlayers?: number;
    counts?: Record<string, number>;
    identityLinks?: Record<string, number>;
    warnings?: string[];
    sources?: {
      cricsheet?: { matches?: number; deliveries?: number; players?: number; warnings?: string[] };
      openipl?: { matchRows?: number; playerRows?: number; pointsRows?: number; warnings?: string[] };
      auction?: { players?: number; totalWinningBidLakh?: number; warnings?: string[] };
      wikidata?: { cachedRecords?: number; retrievedAt?: string | null };
    };
  } | null;
}

export interface DataSourceRecord {
  id: string;
  name: string;
  url: string | null;
  license: string | null;
  attribution: string | null;
  retrievedAt: string | null;
  recordCount: number | null;
  notes: string | null;
}

export interface QualityCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "info";
  detail: string;
}

export interface QualityReport {
  generatedAt: string;
  dataCutoff: string | null;
  builtAt: string | null;
  schemaVersion: string | null;
  latestImport: ImportRunRecord | null;
  sources: DataSourceRecord[];
  tableCounts: Array<{ table: string; rows: number }>;
  players: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    byRole: Array<{ role: string; count: number }>;
    withCricsheetId: number;
    withWikidataId: number;
    missingBirthDate: number;
    missingNationality: number;
    missingOverseas: number;
    aliases: number;
    verifiedImages: number;
    imageRows: number;
  };
  ratings: {
    currentRows: number;
    rated: number;
    unrated: number;
    min: number | null;
    max: number | null;
    average: number | null;
    byEvidence: Array<{ evidence: string; count: number }>;
    versions: Array<{ season: number; rows: number; rated: number }>;
  };
  auction: {
    rows: number;
    verifiedBasePrices: number;
    withBuyerAndPrice: number;
    totalSpendLakh: number;
    highestBidLakh: number | null;
    highestPlayer: string | null;
    belowBasePrice: number;
    rtmEligible: number;
    originalTeamDerived: number;
  };
  matches: {
    total: number;
    firstSeason: number | null;
    lastSeason: number | null;
    deliveries: number;
    season2026Matches: number;
    season2026PlayerStats: number;
    season2026Final: number;
  };
  auctionActivity: {
    sessions: number;
    lots: number;
    bids: number;
    events: number;
    transactions: number;
  };
  checks: QualityCheck[];
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function one<T>(db: ReturnType<typeof getDb>, sql: string, ...params: unknown[]): T {
  return db.prepare(sql).get(...params) as T;
}

function all<T>(db: ReturnType<typeof getDb>, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function getArchiveComposition(): { total: number; byRole: Array<{ role: string; count: number }> } {
  const db = getDb();
  const total = number(one<Scalar>(db, "SELECT COUNT(*) AS n FROM players").n);
  const byRole = all<{ role: string; count: number }>(
    db,
    "SELECT role, COUNT(*) AS count FROM players GROUP BY role ORDER BY count DESC",
  );
  return { total, byRole };
}

export function getQualityReport(): QualityReport {
  const db = getDb();
  const metaRows = all<{ key: string; value: string }>(db, "SELECT key, value FROM meta");
  const meta = new Map(metaRows.map((row) => [row.key, row.value]));

  const runRow = one<{
    id: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    warnings_count: number;
    errors_count: number;
    report_json: string;
  } | undefined>(db, "SELECT * FROM import_runs ORDER BY started_at DESC LIMIT 1");
  const runReport = runRow ? parseJson<ImportRunRecord["report"]>(runRow.report_json) : null;
  const latestImport: ImportRunRecord | null = runRow
    ? {
        id: runRow.id,
        startedAt: runRow.started_at,
        finishedAt: runRow.finished_at,
        status: runRow.status,
        warningsCount: runRow.warnings_count,
        errorsCount: runRow.errors_count,
        warnings: runReport?.warnings ?? [],
        report: runReport,
      }
    : null;

  const sources = all<{
    id: string;
    name: string;
    url: string | null;
    license: string | null;
    attribution: string | null;
    retrieved_at: string | null;
    record_count: number | null;
    notes: string | null;
  }>(db, "SELECT * FROM data_sources ORDER BY record_count DESC").map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    license: row.license,
    attribution: row.attribution,
    retrievedAt: row.retrieved_at,
    recordCount: row.record_count,
    notes: row.notes,
  }));

  const tableNames = all<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const tableCounts = tableNames.map(({ name }) => ({
    table: name,
    rows: number(one<Scalar>(db, `SELECT COUNT(*) AS n FROM "${name}"`).n),
  }));
  const tableCount = new Map(tableCounts.map((row) => [row.table, row.rows]));

  const playersTotal = tableCount.get("players") ?? 0;
  const byStatus = all<{ status: string; count: number }>(
    db,
    "SELECT data_status AS status, COUNT(*) AS count FROM players GROUP BY data_status ORDER BY count DESC",
  );
  const byRole = all<{ role: string; count: number }>(
    db,
    "SELECT role, COUNT(*) AS count FROM players GROUP BY role ORDER BY count DESC",
  );
  const playerFlags = one<{
    cricsheet: number;
    wikidata: number;
    missing_birth: number;
    missing_nationality: number;
    missing_overseas: number;
  }>(
    db,
    `SELECT
       SUM(CASE WHEN cricsheet_id IS NOT NULL THEN 1 ELSE 0 END) AS cricsheet,
       SUM(CASE WHEN wikidata_id IS NOT NULL THEN 1 ELSE 0 END) AS wikidata,
       SUM(CASE WHEN birth_date IS NULL THEN 1 ELSE 0 END) AS missing_birth,
       SUM(CASE WHEN nationality IS NULL THEN 1 ELSE 0 END) AS missing_nationality,
       SUM(CASE WHEN is_overseas IS NULL THEN 1 ELSE 0 END) AS missing_overseas
     FROM players`,
  );

  const currentRows = tableCount.get("player_ratings") ?? 0;
  const rated = number(one<Scalar>(db, "SELECT COUNT(*) AS n FROM player_ratings WHERE ovr IS NOT NULL").n);
  const ratingStats = one<{ min: number | null; max: number | null; avg: number | null }>(
    db,
    "SELECT MIN(ovr) AS min, MAX(ovr) AS max, ROUND(AVG(ovr), 1) AS avg FROM player_ratings WHERE ovr IS NOT NULL",
  );
  const byEvidence = all<{ evidence: string; count: number }>(
    db,
    `SELECT evidence_quality AS evidence,
            SUM(CASE WHEN ovr IS NOT NULL THEN 1 ELSE 0 END) AS count
     FROM player_ratings
     GROUP BY evidence_quality
     ORDER BY count DESC`,
  );
  const versions = all<{ season: number; rows: number; rated: number }>(
    db,
    `SELECT as_of_season AS season,
            COUNT(*) AS rows,
            SUM(CASE WHEN ovr IS NOT NULL THEN 1 ELSE 0 END) AS rated
     FROM player_rating_versions
     GROUP BY as_of_season
     ORDER BY as_of_season`,
  );

  const auctionStats = one<{
    rows: number;
    verified: number;
    with_buyer: number;
    total: number | null;
    highest: number | null;
  }>(
    db,
    `SELECT COUNT(*) AS rows,
            SUM(CASE WHEN base_price_verified = 1 THEN 1 ELSE 0 END) AS verified,
            SUM(CASE WHEN buyer_team_id IS NOT NULL AND winning_bid_lakh IS NOT NULL THEN 1 ELSE 0 END) AS with_buyer,
            SUM(winning_bid_lakh) AS total,
            MAX(winning_bid_lakh) AS highest
     FROM auction_players WHERE auction_year = 2026`,
  );
  const highestPlayer = one<{ full_name: string } | undefined>(
    db,
    `SELECT p.full_name FROM auction_players a JOIN players p ON p.id = a.player_id
     WHERE a.auction_year = 2026 AND a.winning_bid_lakh IS NOT NULL
     ORDER BY a.winning_bid_lakh DESC LIMIT 1`,
  )?.full_name ?? null;
  const belowBase = number(
    one<Scalar>(
      db,
      "SELECT COUNT(*) AS n FROM auction_players WHERE auction_year = 2026 AND winning_bid_lakh IS NOT NULL AND winning_bid_lakh < base_price_lakh",
    ).n,
  );
  const rtmEligible = number(
    one<Scalar>(db, "SELECT COUNT(*) AS n FROM auction_players WHERE auction_year = 2026 AND rtm_eligible = 1").n,
  );
  const originalTeamDerived = number(
    one<Scalar>(
      db,
      "SELECT COUNT(*) AS n FROM auction_players WHERE auction_year = 2026 AND original_team_id IS NOT NULL",
    ).n,
  );

  const matchStats = one<{
    total: number;
    first: number | null;
    last: number | null;
    deliveries: number;
    finals: number;
  }>(
    db,
    `SELECT (SELECT COUNT(*) FROM matches) AS total,
            (SELECT MIN(season) FROM matches) AS first,
            (SELECT MAX(season) FROM matches) AS last,
            (SELECT COUNT(*) FROM deliveries) AS deliveries,
            (SELECT COUNT(*) FROM matches WHERE season = 2026 AND LOWER(stage) LIKE '%final%') AS finals`,
  );
  const season2026Matches = number(
    one<Scalar>(db, "SELECT COUNT(*) AS n FROM matches WHERE season = 2026").n,
  );
  const season2026PlayerStats = number(
    one<Scalar>(db, "SELECT COUNT(*) AS n FROM player_match_stats WHERE season = 2026").n,
  );

  const images = one<{ rows: number; verified: number }>(
    db,
    "SELECT COUNT(*) AS rows, COALESCE(SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END), 0) AS verified FROM player_images",
  );
  const brand = brandAssetCoverage();

  const checks: QualityCheck[] = [];

  const fkIssues = all<Record<string, unknown>>(db, "PRAGMA foreign_key_check");
  checks.push({
    id: "foreign-keys",
    label: "Foreign-key integrity",
    status: fkIssues.length === 0 ? "pass" : "warn",
    detail:
      fkIssues.length === 0
        ? "PRAGMA foreign_key_check returned no violations across every table."
        : `${fkIssues.length} foreign-key violation${fkIssues.length === 1 ? "" : "s"} found. Inspect before trusting joins.`,
  });

  const quickCheck = one<{ quick_check: string }>(db, "PRAGMA quick_check");
  checks.push({
    id: "sqlite-integrity",
    label: "SQLite quick check",
    status: quickCheck.quick_check === "ok" ? "pass" : "warn",
    detail:
      quickCheck.quick_check === "ok"
        ? "The database file passes PRAGMA quick_check."
        : `PRAGMA quick_check reported: ${quickCheck.quick_check}`,
  });

  checks.push({
    id: "import-status",
    label: "Last import run",
    status: latestImport ? (latestImport.status === "success" ? "pass" : "warn") : "warn",
    detail: latestImport
      ? `${latestImport.id} finished with ${latestImport.errorsCount} errors and ${latestImport.warningsCount} warnings.`
      : "No import run is recorded in this database.",
  });

  checks.push({
    id: "auction-prices",
    label: "Auction base prices",
    status: auctionStats.rows === 0 ? "warn" : auctionStats.verified === auctionStats.rows ? "pass" : "warn",
    detail: `${auctionStats.verified} of ${auctionStats.rows} 2026 auction rows carry the supplied, verified base price.`,
  });

  checks.push({
    id: "auction-outcomes",
    label: "Auction sale outcomes",
    status: auctionStats.with_buyer === auctionStats.rows ? "pass" : "warn",
    detail: `${auctionStats.with_buyer} of ${auctionStats.rows} 2026 auction rows have both a buyer and a winning bid.`,
  });

  checks.push({
    id: "auction-above-base",
    label: "Bids at or above base price",
    status: belowBase === 0 ? "pass" : "warn",
    detail:
      belowBase === 0
        ? "Every recorded winning bid is at least the player's base price."
        : `${belowBase} winning bid${belowBase === 1 ? " is" : "s are"} below the recorded base price.`,
  });

  checks.push({
    id: "rating-coverage",
    label: "Current rating coverage",
    status: currentRows === playersTotal ? "pass" : "warn",
    detail: `${currentRows} current rating rows for ${playersTotal} players; ${rated} have a numeric OVR and ${currentRows - rated} are below the minimum evidence threshold.`,
  });

  const sessionRows = tableCount.get("auction_sessions") ?? 0;
  if (sessionRows > 0) {
    const purseMismatch = number(
      one<Scalar>(
        db,
        `SELECT COUNT(*) AS n FROM session_teams
         WHERE purse_lakh + spent_lakh != opening_purse_lakh`,
      ).n,
    );
    checks.push({
      id: "session-purses",
      label: "Session purse arithmetic",
      status: purseMismatch === 0 ? "pass" : "warn",
      detail:
        purseMismatch === 0
          ? "For every session team, purse + spent equals the opening purse."
          : `${purseMismatch} session team record${purseMismatch === 1 ? " does" : "s do"} not reconcile purse + spent to the opening purse.`,
    });
    const soldIncomplete = number(
      one<Scalar>(
        db,
        `SELECT COUNT(*) AS n FROM auction_lots
         WHERE status = 'sold' AND (winning_team_id IS NULL OR final_price_lakh IS NULL)`,
      ).n,
    );
    checks.push({
      id: "sold-lots",
      label: "Sold lots are complete",
      status: soldIncomplete === 0 ? "pass" : "warn",
      detail:
        soldIncomplete === 0
          ? "Every sold lot has a winning team and a final price."
          : `${soldIncomplete} sold lot${soldIncomplete === 1 ? " is" : "s are"} missing a winning team or final price.`,
    });
  } else {
    checks.push({
      id: "session-purses",
      label: "Session purse arithmetic",
      status: "info",
      detail: "No auction sessions have been created yet, so there is no live session accounting to reconcile.",
    });
  }

  checks.push({
    id: "photos",
    label: "Player portraits",
    status: brand.players > 0 ? "pass" : "info",
    detail:
      brand.players > 0
        ? `${brand.players} squad portraits and ${brand.teams} franchise crests are stored locally from the public IPL team pages. Unmatched or retired players fall back to branded initials.`
        : "No official portraits are stored locally. Every player surface uses the branded initials fallback.",
  });

  checks.push({
    id: "future-rules",
    label: "2027 mini auction",
    status: "warn",
    detail:
      "The 2027 mini auction is selectable. Retentions use official 2026 winning bids where supplied; the remaining salaries and the ₹130 crore purse are labelled simulator estimates.",
  });

  checks.push({
    id: "unsold-list",
    label: "2026 unsold list",
    status: "info",
    detail:
      "The supplied dataset contains 77 sold players only. Unsold players are not asserted as verified auction lots anywhere in the app.",
  });

  return {
    generatedAt: new Date().toISOString(),
    dataCutoff: meta.get("data_cutoff") ?? null,
    builtAt: meta.get("built_at") ?? null,
    schemaVersion: meta.get("schema_version") ?? null,
    latestImport,
    sources,
    tableCounts,
    players: {
      total: playersTotal,
      byStatus,
      byRole,
      withCricsheetId: playerFlags.cricsheet,
      withWikidataId: playerFlags.wikidata,
      missingBirthDate: playerFlags.missing_birth,
      missingNationality: playerFlags.missing_nationality,
      missingOverseas: playerFlags.missing_overseas,
      aliases: tableCount.get("player_aliases") ?? 0,
      verifiedImages: brand.players,
      imageRows: images.rows,
    },
    ratings: {
      currentRows,
      rated,
      unrated: currentRows - rated,
      min: ratingStats.min,
      max: ratingStats.max,
      average: ratingStats.avg,
      byEvidence,
      versions,
    },
    auction: {
      rows: auctionStats.rows,
      verifiedBasePrices: auctionStats.verified,
      withBuyerAndPrice: auctionStats.with_buyer,
      totalSpendLakh: number(auctionStats.total),
      highestBidLakh: auctionStats.highest,
      highestPlayer,
      belowBasePrice: belowBase,
      rtmEligible,
      originalTeamDerived,
    },
    matches: {
      total: matchStats.total,
      firstSeason: matchStats.first,
      lastSeason: matchStats.last,
      deliveries: matchStats.deliveries,
      season2026Matches,
      season2026PlayerStats,
      season2026Final: matchStats.finals,
    },
    auctionActivity: {
      sessions: tableCount.get("auction_sessions") ?? 0,
      lots: tableCount.get("auction_lots") ?? 0,
      bids: tableCount.get("auction_bids") ?? 0,
      events: tableCount.get("auction_events") ?? 0,
      transactions: tableCount.get("auction_transactions") ?? 0,
    },
    checks,
  };
}
