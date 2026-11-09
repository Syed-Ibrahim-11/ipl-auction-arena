import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_SQL, SCHEMA_VERSION } from "@/db/schema";
import { ALL_FRANCHISES, getFranchise } from "@/lib/teams";
import { normalizeName, slugify } from "@/lib/data/names";
import {
  type Aggregate,
  emptyAggregate,
  mergeAggregate,
} from "@/lib/data/stats";
import {
  RATING_FORMULA_VERSION,
  computeRatings,
  type RatingInput,
  type RatingResult,
  type RatingRole,
} from "@/lib/ratings";
import { RULEBOOKS } from "@/lib/rules";
import { parseCricsheet, type CricsheetImport } from "./import/cricsheet";
import { parseOpenIpl, type OpenIplData } from "./import/openipl";
import { parseAuctionCsv, type AuctionData } from "./import/auction";
import {
  NATIONALITY_OVERRIDES,
  auctionOnlyCount,
  resolveAuctionIdentities,
  type ResolvedAuctionIdentity,
} from "./import/identity";
import { loadWikidataCache, type WikidataCache } from "./import/wikidata";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "ipl-arena.db");
const BUILD_PATH = path.join(DATA_DIR, "ipl-arena.building.db");
const REPORT_PATH = path.join(DATA_DIR, "reports", "import-report.json");
const SUMMARY_PATH = path.join(DATA_DIR, "reports", "import-summary.md");
const RATING_SEASONS = [2024, 2025, 2026] as const;

type CatalogPlayer = {
  id: string;
  cricsheetId: string | null;
  fullName: string;
  shortName: string;
  nationality: string | null;
  country: string | null;
  isOverseas: number | null;
  capped: number | null;
  birthDate: string | null;
  role: RatingRole;
  roleSource: string;
  bowlingStyle: string | null;
  primaryTeamId: string | null;
  dataStatus: string;
  wikidataId: string | null;
  wikidataRetrievedAt: string | null;
  aliases: Array<{ alias: string; source: string }>;
};

const now = new Date().toISOString();
const warnings: string[] = [];

function normalizeOverrideKey(value: string): string {
  return normalizeName(value);
}

const nationalityOverrides = new Map(
  Object.entries(NATIONALITY_OVERRIDES).map(([name, value]) => [normalizeOverrideKey(name), value]),
);

function phaseJson(agg: Aggregate): string {
  return JSON.stringify({
    bat: { pp: agg.ppBat, mid: agg.midBat, death: agg.deathBat },
    bowl: { pp: agg.ppBowl, mid: agg.midBowl, death: agg.deathBowl },
  });
}

function inferRole(career: Aggregate | undefined, stumpings = 0): { role: RatingRole; source: string } {
  if (stumpings > 0) return { role: "wicketkeeper", source: "derived_cricsheet_stumpings" };
  if (!career) return { role: "unknown", source: "unavailable" };
  const batting = career.ballsFaced >= 240;
  const bowling = career.ballsBowled >= 240;
  if (batting && bowling) return { role: "all-rounder", source: "derived_cricsheet_workload" };
  if (batting) return { role: "batter", source: "derived_cricsheet_workload" };
  if (bowling) return { role: "bowler", source: "derived_cricsheet_workload" };
  return { role: "unknown", source: "insufficient_evidence" };
}

function isKnownRole(value: string): value is RatingRole {
  return value === "batter" || value === "bowler" || value === "all-rounder" || value === "wicketkeeper";
}

function latestTeamBySeason(cs: CricsheetImport, season: number): Map<string, { teamId: string; date: string }> {
  const result = new Map<string, { teamId: string; date: string }>();
  for (const match of cs.matches) {
    if (match.season !== season) continue;
    for (const stat of match.playerStats) {
      const existing = result.get(stat.playerId);
      if (!existing || match.date >= existing.date) {
        result.set(stat.playerId, { teamId: stat.teamId, date: match.date });
      }
    }
  }
  return result;
}

function buildPlayerCatalog(
  cs: CricsheetImport,
  openipl: OpenIplData,
  identities: ResolvedAuctionIdentity[],
  wiki: WikidataCache | null,
): { catalog: Map<string, CatalogPlayer>; team2026: Map<string, string> } {
  const catalog = new Map<string, CatalogPlayer>();
  const team2026 = new Map(
    openipl.players
      .filter((player): player is typeof player & { cricsheetId: string } => Boolean(player.cricsheetId))
      .map((player) => [player.cricsheetId, player.teamId]),
  );
  const openRoleById = new Map<string, string>();
  const openNameById = new Map<string, string>();
  for (const player of openipl.players) {
    if (!player.cricsheetId) continue;
    openRoleById.set(player.cricsheetId, player.role);
    openNameById.set(player.cricsheetId, player.name);
  }
  const auctionByIdentity = new Map<string, ResolvedAuctionIdentity>();
  for (const identity of identities) auctionByIdentity.set(identity.playerId, identity);
  const latest2026 = latestTeamBySeason(cs, 2026);
  const latestAny = latestTeamBySeason(cs, Math.max(...cs.matches.map((match) => match.season)));
  const activeSeason = Math.max(...cs.matches.map((match) => match.season));
  const latestActive = latestTeamBySeason(cs, activeSeason);

  const addPlayer = (args: {
    id: string;
    cricsheetId: string | null;
    shortName: string;
    identity?: ResolvedAuctionIdentity;
    keyCricinfo?: string | null;
  }): void => {
    if (catalog.has(args.id)) return;
    const career = cs.career.get(args.cricsheetId ?? "");
    const wikiRecord = args.keyCricinfo ? wiki?.records[args.keyCricinfo] : undefined;
    const auction = args.identity?.auction;
    const candidates = [
      auction?.name,
      wikiRecord?.label,
      wikiRecord?.wikiTitle,
      args.shortName,
    ].filter((value): value is string => Boolean(value));
    const override = candidates.map((value) => nationalityOverrides.get(normalizeOverrideKey(value))).find(Boolean);
    const openRole = args.cricsheetId ? openRoleById.get(args.cricsheetId) : undefined;
    // Cricsheet stumpings are direct evidence of glovework; openIPL's coarse role labels
    // classify every keeper-batter as a plain batter, which would leave the pool with no keepers.
    const isEvidencedKeeper = (career?.stumpings ?? 0) > 0;
    const roleInfo = isEvidencedKeeper
      ? { role: "wicketkeeper" as const, source: "derived_cricsheet_stumpings" }
      : openRole && isKnownRole(openRole)
        ? { role: openRole, source: "openipl_2026" }
        : inferRole(career, career?.stumpings ?? 0);
    const wikiCountries = override?.countries ?? wikiRecord?.countries ?? [];
    const country = wikiCountries.length > 0
      ? wikiCountries.join(" / ")
      : auction
        ? auction.isOverseas
          ? null
          : "India"
        : null;
    let isOverseas: number | null = null;
    if (auction) isOverseas = auction.isOverseas ? 1 : 0;
    else if (wikiCountries.length > 0) isOverseas = wikiCountries.includes("India") ? 0 : 1;
    const fullName = auction?.name || wikiRecord?.label || wikiRecord?.wikiTitle || args.shortName;
    const shortName = args.shortName;
    const primaryTeamId =
      team2026.get(args.id) ??
      latest2026.get(args.id)?.teamId ??
      auction?.teamId ??
      latestActive.get(args.id)?.teamId ??
      latestAny.get(args.id)?.teamId ??
      null;
    const hasStats = Boolean(career && career.matches > 0);
    const dataStatus = auction
      ? hasStats
        ? "stats_auction"
        : "auction_only"
      : hasStats
        ? "stats_only"
        : "registry_only";
    const aliases = new Map<string, string>();
    const addAlias = (alias: string | null | undefined, source: string) => {
      if (!alias?.trim()) return;
      const key = `${alias.trim()}|${source}`;
      if (!aliases.has(key)) aliases.set(key, source);
    };
    addAlias(args.shortName, "cricsheet");
    addAlias(openNameById.get(args.id), "openipl_2026");
    addAlias(auction?.name, "auction_2026");
    addAlias(wikiRecord?.label, "wikidata");
    addAlias(wikiRecord?.wikiTitle, "wikipedia");
    addAlias(fullName, "display");
    catalog.set(args.id, {
      id: args.id,
      cricsheetId: args.cricsheetId,
      fullName,
      shortName,
      nationality: country,
      country,
      isOverseas,
      capped: auction ? (auction.capped === null ? null : auction.capped ? 1 : 0) : null,
      birthDate: wikiRecord?.birthDate ?? null,
      role: roleInfo.role,
      roleSource: roleInfo.source,
      bowlingStyle: wikiRecord?.bowlingStyle ?? null,
      primaryTeamId,
      dataStatus,
      wikidataId: wikiRecord?.qid ?? null,
      wikidataRetrievedAt: wikiRecord ? wiki?.retrievedAt ?? null : null,
      aliases: [...aliases.keys()].map((key) => {
        const [alias, source] = key.split("|");
        return { alias, source };
      }),
    });
  };

  for (const person of cs.people.values()) {
    const registryPerson = cs.registry.get(person.id);
    const keyCricinfo = person.keyCricinfo ?? registryPerson?.keyCricinfo ?? null;
    addPlayer({
      id: person.id,
      cricsheetId: person.id,
      shortName: person.name,
      identity: auctionByIdentity.get(person.id),
      keyCricinfo,
    });
  }

  for (const identity of identities) {
    if (catalog.has(identity.playerId)) {
      const existing = catalog.get(identity.playerId)!;
      if (!existing.aliases.some((entry) => normalizeName(entry.alias) === normalizeName(identity.auction.name))) {
        existing.aliases.push({ alias: identity.auction.name, source: "auction_2026" });
      }
      continue;
    }
    const registryPerson = identity.cricsheetId ? cs.registry.get(identity.cricsheetId) : undefined;
    addPlayer({
      id: identity.playerId,
      cricsheetId: identity.cricsheetId,
      shortName: identity.matchName ?? identity.auction.name,
      identity,
      keyCricinfo: registryPerson?.keyCricinfo ?? null,
    });
  }

  for (const player of openipl.players) {
    if (!player.cricsheetId) {
      const id = `opl-${slugify(player.name)}`;
      addPlayer({
        id,
        cricsheetId: null,
        shortName: player.name,
        keyCricinfo: null,
      });
    }
  }

  for (const override of Object.entries(NATIONALITY_OVERRIDES)) {
    const [name, value] = override;
    const normalized = normalizeOverrideKey(name);
    for (const player of catalog.values()) {
      const matches = [player.fullName, player.shortName, ...player.aliases.map((entry) => entry.alias)]
        .some((candidate) => normalizeOverrideKey(candidate) === normalized);
      if (!matches) continue;
      player.country = value.countries.join(" / ");
      player.nationality = player.country;
      if (player.isOverseas === null) {
        player.isOverseas = value.countries.includes("India") ? 0 : 1;
      }
      player.aliases.push({ alias: name, source: "override" });
    }
  }

  for (const player of catalog.values()) {
    if (!player.primaryTeamId || !getFranchise(player.primaryTeamId)) player.primaryTeamId = null;
    if (player.capped !== null) continue;
    const identity = identities.find((entry) => entry.playerId === player.id);
    if (identity) player.capped = identity.auction.capped === null ? null : identity.auction.capped ? 1 : 0;
  }

  return { catalog, team2026 };
}

function writeDatabase(
  db: Database.Database,
  cs: CricsheetImport,
  openipl: OpenIplData,
  auction: AuctionData,
  identities: ResolvedAuctionIdentity[],
  catalog: Map<string, CatalogPlayer>,
  wiki: WikidataCache | null,
): {
  ratingVersions: Map<number, Map<string, RatingResult>>;
  counts: Record<string, number>;
  reportData: Record<string, unknown>;
} {
  const counts: Record<string, number> = {};
  const teamCount = db.prepare(
    "INSERT INTO teams (id, name, short_name, city, primary_color, secondary_color, ink_color, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const team of ALL_FRANCHISES) {
    teamCount.run(
      team.id,
      team.name,
      team.shortName,
      team.city,
      team.primary,
      team.secondary,
      team.ink,
      team.active ? 1 : 0,
    );
  }
  counts.teams = ALL_FRANCHISES.length;

  const playerInsert = db.prepare(`
    INSERT INTO players (
      id, cricsheet_id, full_name, short_name, nationality, country, is_overseas, capped,
      birth_date, role, role_source, batting_style, bowling_style, primary_team_id,
      data_status, wikidata_id, wikidata_retrieved_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const aliasInsert = db.prepare(`
    INSERT OR IGNORE INTO player_aliases (player_id, alias, normalized, source, confidence)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const player of catalog.values()) {
    playerInsert.run(
      player.id,
      player.cricsheetId,
      player.fullName,
      player.shortName,
      player.nationality,
      player.country,
      player.isOverseas,
      player.capped,
      player.birthDate,
      player.role,
      player.roleSource,
      null,
      player.bowlingStyle,
      player.primaryTeamId,
      player.dataStatus,
      player.wikidataId,
      player.wikidataRetrievedAt,
      now,
    );
    for (const alias of player.aliases) {
      aliasInsert.run(player.id, alias.alias, normalizeName(alias.alias), alias.source, 1);
    }
  }
  counts.players = catalog.size;

  const careerInsert = db.prepare(`
    INSERT INTO player_career_stats (
      player_id, matches, first_season, last_season, teams_count,
      innings_bat, runs, balls_faced, dismissals, not_outs, fours, sixes, fifties, hundreds,
      high_score, high_score_not_out, twenty_plus, innings_bowl, balls_bowled, runs_conceded,
      wickets, best_bowling_wickets, best_bowling_runs, dots, catches, run_outs, stumpings,
      pp_runs, pp_balls, pp_dismissals, pp_fours, pp_sixes,
      mid_runs, mid_balls, mid_dismissals, mid_fours, mid_sixes,
      death_runs, death_balls, death_dismissals, death_fours, death_sixes,
      pp_bowl_balls, pp_bowl_runs, pp_bowl_wickets, pp_bowl_dots,
      mid_bowl_balls, mid_bowl_runs, mid_bowl_wickets, mid_bowl_dots,
      death_bowl_balls, death_bowl_runs, death_bowl_wickets, death_bowl_dots,
      phases_json
    ) VALUES (
      @player_id, @matches, @first_season, @last_season, @teams_count,
      @innings_bat, @runs, @balls_faced, @dismissals, @not_outs, @fours, @sixes, @fifties, @hundreds,
      @high_score, @high_score_not_out, @twenty_plus, @innings_bowl, @balls_bowled, @runs_conceded,
      @wickets, @best_bowling_wickets, @best_bowling_runs, @dots, @catches, @run_outs, @stumpings,
      @pp_runs, @pp_balls, @pp_dismissals, @pp_fours, @pp_sixes,
      @mid_runs, @mid_balls, @mid_dismissals, @mid_fours, @mid_sixes,
      @death_runs, @death_balls, @death_dismissals, @death_fours, @death_sixes,
      @pp_bowl_balls, @pp_bowl_runs, @pp_bowl_wickets, @pp_bowl_dots,
      @mid_bowl_balls, @mid_bowl_runs, @mid_bowl_wickets, @mid_bowl_dots,
      @death_bowl_balls, @death_bowl_runs, @death_bowl_wickets, @death_bowl_dots,
      @phases_json
    )
  `);

  const seasonsByPlayer = new Map<string, Map<number, Aggregate>>();
  for (const season of cs.seasons.values()) {
    if (!catalog.has(season.playerId)) continue;
    const playerSeasons = seasonsByPlayer.get(season.playerId) ?? new Map<number, Aggregate>();
    const agg = playerSeasons.get(season.season) ?? emptyAggregate();
    mergeAggregate(agg, season.agg);
    playerSeasons.set(season.season, agg);
    seasonsByPlayer.set(season.playerId, playerSeasons);
  }

  for (const player of catalog.values()) {
    const seasons = seasonsByPlayer.get(player.id);
    const career = cs.career.get(player.cricsheetId ?? "");
    if (!career || !seasons || seasons.size === 0) continue;
    const seasonList = [...seasons.keys()].sort((a, b) => a - b);
    careerInsert.run({
      player_id: player.id,
      matches: career.matches,
      first_season: seasonList[0] ?? null,
      last_season: seasonList[seasonList.length - 1] ?? null,
      teams_count: new Set(
        cs.seasons
          .values()
          .filter((row) => row.playerId === player.id)
          .map((row) => row.teamId),
      ).size,
      innings_bat: career.inningsBat,
      runs: career.runs,
      balls_faced: career.ballsFaced,
      dismissals: career.dismissals,
      not_outs: career.notOuts,
      fours: career.fours,
      sixes: career.sixes,
      fifties: career.fifties,
      hundreds: career.hundreds,
      high_score: career.highScore,
      high_score_not_out: career.highScoreNotOut ? 1 : 0,
      twenty_plus: career.twentyPlus,
      innings_bowl: career.inningsBowl,
      balls_bowled: career.ballsBowled,
      runs_conceded: career.runsConceded,
      wickets: career.wickets,
      best_bowling_wickets: career.bestBowlingWickets,
      best_bowling_runs: career.bestBowlingRuns,
      dots: career.dots,
      catches: career.catches,
      run_outs: career.runOuts,
      stumpings: career.stumpings,
      pp_runs: career.ppBat.runs,
      pp_balls: career.ppBat.balls,
      pp_dismissals: career.ppBat.dismissals,
      pp_fours: career.ppBat.fours,
      pp_sixes: career.ppBat.sixes,
      mid_runs: career.midBat.runs,
      mid_balls: career.midBat.balls,
      mid_dismissals: career.midBat.dismissals,
      mid_fours: career.midBat.fours,
      mid_sixes: career.midBat.sixes,
      death_runs: career.deathBat.runs,
      death_balls: career.deathBat.balls,
      death_dismissals: career.deathBat.dismissals,
      death_fours: career.deathBat.fours,
      death_sixes: career.deathBat.sixes,
      pp_bowl_balls: career.ppBowl.balls,
      pp_bowl_runs: career.ppBowl.runs,
      pp_bowl_wickets: career.ppBowl.wickets,
      pp_bowl_dots: career.ppBowl.dots,
      mid_bowl_balls: career.midBowl.balls,
      mid_bowl_runs: career.midBowl.runs,
      mid_bowl_wickets: career.midBowl.wickets,
      mid_bowl_dots: career.midBowl.dots,
      death_bowl_balls: career.deathBowl.balls,
      death_bowl_runs: career.deathBowl.runs,
      death_bowl_wickets: career.deathBowl.wickets,
      death_bowl_dots: career.deathBowl.dots,
      phases_json: phaseJson(career),
    });
  }
  counts.careerStats = (db.prepare("SELECT COUNT(*) AS n FROM player_career_stats").get() as { n: number }).n;

  const seasonInsert = db.prepare(`
    INSERT INTO player_season_stats (
      player_id, season, team_id, matches, innings_bat, runs, balls_faced, dismissals, not_outs,
      fours, sixes, fifties, hundreds, high_score, high_score_not_out, twenty_plus,
      innings_bowl, balls_bowled, runs_conceded, wickets, best_bowling_wickets, best_bowling_runs,
      dots, catches, run_outs, stumpings, phases_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const season of cs.seasons.values()) {
    if (!catalog.has(season.playerId)) continue;
    const agg = season.agg;
    seasonInsert.run(
      season.playerId,
      season.season,
      season.teamId,
      agg.matches,
      agg.inningsBat,
      agg.runs,
      agg.ballsFaced,
      agg.dismissals,
      agg.notOuts,
      agg.fours,
      agg.sixes,
      agg.fifties,
      agg.hundreds,
      agg.highScore,
      agg.highScoreNotOut ? 1 : 0,
      agg.twentyPlus,
      agg.inningsBowl,
      agg.ballsBowled,
      agg.runsConceded,
      agg.wickets,
      agg.bestBowlingWickets,
      agg.bestBowlingRuns,
      agg.dots,
      agg.catches,
      agg.runOuts,
      agg.stumpings,
      phaseJson(agg),
    );
  }
  counts.seasonStats = (db.prepare("SELECT COUNT(*) AS n FROM player_season_stats").get() as { n: number }).n;

  const openiplByMatch = new Map(openipl.matches.map((match) => [match.cricsheetMatchId, match]));
  const matchInsert = db.prepare(`
    INSERT INTO matches (
      id, season, match_number, date, venue, city, team1_id, team2_id, toss_winner_id, toss_decision,
      winner_id, result, win_by_runs, win_by_wickets, player_of_match, player_of_match_id,
      team1_score, team2_score, team1_overs, team2_overs, stage, source, source_match_id, dls,
      dls_revised_target, target_overs, method, officials_json, innings_json
    ) VALUES (
      @id, @season, @match_number, @date, @venue, @city, @team1_id, @team2_id, @toss_winner_id, @toss_decision,
      @winner_id, @result, @win_by_runs, @win_by_wickets, @player_of_match, @player_of_match_id,
      @team1_score, @team2_score, @team1_overs, @team2_overs, @stage, @source, @source_match_id, @dls,
      @dls_revised_target, @target_overs, @method, @officials_json, @innings_json
    )
  `);
  const statsInsert = db.prepare(`
    INSERT INTO player_match_stats (
      player_id, match_id, season, date, team_id, opponent_team_id, venue,
      runs, balls_faced, fours, sixes, dismissal, not_out, balls_bowled, runs_conceded,
      wickets, dots, catches, run_outs, stumpings,
      pp_runs, pp_balls, mid_runs, mid_balls, death_runs, death_balls, phases_json
    ) VALUES (
      @player_id, @match_id, @season, @date, @team_id, @opponent_team_id, @venue,
      @runs, @balls_faced, @fours, @sixes, @dismissal, @not_out, @balls_bowled, @runs_conceded,
      @wickets, @dots, @catches, @run_outs, @stumpings,
      @pp_runs, @pp_balls, @mid_runs, @mid_balls, @death_runs, @death_balls, @phases_json
    )
  `);
  const deliveryInsert = db.prepare(`
    INSERT INTO deliveries (
      match_id, innings_number, over_number, ball_number, actual_delivery, batter_id, bowler_id,
      non_striker_id, runs_batter, runs_extras, runs_total, extras_json, wicket_kind,
      player_out_id, fielders_json, is_legal, phase
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const match of cs.matches) {
    const meta = openiplByMatch.get(match.sourceId) ?? openiplByMatch.get(match.id);
    matchInsert.run({
      id: match.id,
      season: match.season,
      match_number: meta?.matchNumber ?? match.matchNumber,
      date: match.date,
      venue: match.venue,
      city: match.city,
      team1_id: match.team1Id,
      team2_id: match.team2Id,
      toss_winner_id: match.tossWinnerId,
      toss_decision: match.tossDecision,
      winner_id: match.winnerId,
      result: match.result,
      win_by_runs: match.winByRuns,
      win_by_wickets: match.winByWickets,
      player_of_match: match.playerOfMatch,
      player_of_match_id: match.playerOfMatchId && catalog.has(match.playerOfMatchId) ? match.playerOfMatchId : null,
      team1_score: match.team1Score,
      team2_score: match.team2Score,
      team1_overs: match.team1Overs,
      team2_overs: match.team2Overs,
      stage: meta?.stage ?? match.stage,
      source: meta ? "openipl+cricsheet" : "cricsheet",
      source_match_id: match.sourceId,
      dls: match.dls,
      dls_revised_target: meta?.dlsRevisedTarget ?? null,
      target_overs: meta?.targetOvers ?? null,
      method: meta?.method ?? null,
      officials_json: meta
        ? JSON.stringify({ umpires: meta.umpires, referee: meta.matchReferee })
        : null,
      innings_json: JSON.stringify(match.innings),
    });
    for (const stat of match.playerStats) {
      if (!catalog.has(stat.playerId)) continue;
      statsInsert.run({
        player_id: stat.playerId,
        match_id: match.id,
        season: match.season,
        date: match.date,
        team_id: stat.teamId,
        opponent_team_id: stat.opponentTeamId,
        venue: match.venue,
        runs: stat.agg.runs,
        balls_faced: stat.agg.ballsFaced,
        fours: stat.agg.fours,
        sixes: stat.agg.sixes,
        dismissal: stat.dismissal,
        not_out: stat.notOut,
        balls_bowled: stat.agg.ballsBowled,
        runs_conceded: stat.agg.runsConceded,
        wickets: stat.agg.wickets,
        dots: stat.agg.dots,
        catches: stat.agg.catches,
        run_outs: stat.agg.runOuts,
        stumpings: stat.agg.stumpings,
        pp_runs: stat.agg.ppBat.runs,
        pp_balls: stat.agg.ppBat.balls,
        mid_runs: stat.agg.midBat.runs,
        mid_balls: stat.agg.midBat.balls,
        death_runs: stat.agg.deathBat.runs,
        death_balls: stat.agg.deathBat.balls,
        phases_json: phaseJson(stat.agg),
      });
    }
    for (const delivery of match.deliveries) {
      if (!catalog.has(delivery.batterId) || !catalog.has(delivery.bowlerId)) continue;
      deliveryInsert.run(
        match.id,
        delivery.inningsNumber,
        delivery.overNumber,
        delivery.ballNumber,
        delivery.actualDelivery,
        delivery.batterId,
        delivery.bowlerId,
        delivery.nonStrikerId && catalog.has(delivery.nonStrikerId) ? delivery.nonStrikerId : null,
        delivery.runsBatter,
        delivery.runsExtras,
        delivery.runsTotal,
        delivery.extrasJson,
        delivery.wicketKind,
        delivery.playerOutId && catalog.has(delivery.playerOutId) ? delivery.playerOutId : null,
        delivery.fieldersJson,
        delivery.isLegal,
        delivery.phase,
      );
    }
  }
  counts.matches = (db.prepare("SELECT COUNT(*) AS n FROM matches").get() as { n: number }).n;
  counts.matchStats = (db.prepare("SELECT COUNT(*) AS n FROM player_match_stats").get() as { n: number }).n;
  counts.deliveries = (db.prepare("SELECT COUNT(*) AS n FROM deliveries").get() as { n: number }).n;

  const pointsInsert = db.prepare(`
    INSERT INTO points_table (season, position, team_id, played, won, lost, no_result, net_run_rate, points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of openipl.pointsTable) {
    pointsInsert.run(
      openipl.season,
      row.position,
      row.teamId,
      row.played,
      row.won,
      row.lost,
      row.noResult,
      row.netRunRate,
      row.points,
    );
  }
  counts.pointsRows = openipl.pointsTable.length;

  const original2025 = latestTeamBySeason(cs, 2025);
  const auctionInsert = db.prepare(`
    INSERT INTO auction_players (
      player_id, auction_year, base_price_lakh, base_price_verified, winning_bid_lakh, buyer_team_id,
      capped_label, nationality_label, source, original_team_id, original_team_source, rtm_eligible, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const identity of identities) {
    const auction = identity.auction;
    const originalTeam = original2025.get(identity.playerId);
    auctionInsert.run(
      identity.playerId,
      2026,
      auction.basePriceLakh,
      1,
      auction.winningBidLakh,
      auction.teamId,
      auction.cappedLabel,
      auction.nationalityLabel,
      "supplied_2026_sold_csv",
      originalTeam?.teamId ?? null,
      originalTeam ? "Cricsheet 2025 appearance" : null,
      originalTeam ? 1 : 0,
      [
        `CSV row ${auction.rowNumber}.`,
        identity.method === "auction_only"
          ? "No reliable IPL identity exists in the supplied Cricsheet archive; statistics are unavailable."
          : `Identity linked to ${identity.matchName} (${identity.method}).`,
        identity.note,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  counts.auctionPlayers = identities.length;

  const ratingVersions = new Map<number, Map<string, RatingResult>>();
  const ratingInputs: RatingInput[] = [];
  for (const player of catalog.values()) {
    const seasonMap = seasonsByPlayer.get(player.id);
    if (!seasonMap || seasonMap.size === 0) continue;
    ratingInputs.push({
      playerId: player.id,
      role: player.role,
      seasons: [...seasonMap.entries()].map(([season, agg]) => ({ season, agg })),
    });
  }
  const versionInsert = db.prepare(`
    INSERT INTO player_rating_versions (
      player_id, as_of_season, formula_version, role, ovr, batting, bowling, fielding,
      batting_raw, bowling_raw, fielding_raw, evidence_quality, breakdown_json, sample_json, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const currentInsert = db.prepare(`
    INSERT INTO player_ratings (
      player_id, formula_version, as_of_season, role, ovr, batting, bowling, fielding,
      batting_raw, bowling_raw, fielding_raw, evidence_quality, breakdown_json, sample_json, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const asOf of RATING_SEASONS) {
    const ratings = computeRatings(ratingInputs, asOf);
    ratingVersions.set(asOf, ratings);
    for (const rating of ratings.values()) {
      versionInsert.run(
        rating.playerId,
        asOf,
        RATING_FORMULA_VERSION,
        rating.breakdown.role,
        rating.ovr,
        rating.batting,
        rating.bowling,
        rating.fielding,
        rating.breakdown.batting?.raw ?? null,
        rating.breakdown.bowling?.raw ?? null,
        rating.breakdown.fielding?.raw ?? null,
        rating.evidenceQuality,
        JSON.stringify(rating.breakdown),
        JSON.stringify(rating.sample),
        now,
      );
    }
  }
  const current2026 = ratingVersions.get(2026) ?? new Map<string, RatingResult>();
  for (const rating of current2026.values()) {
    currentInsert.run(
      rating.playerId,
      RATING_FORMULA_VERSION,
      2026,
      rating.breakdown.role,
      rating.ovr,
      rating.batting,
      rating.bowling,
      rating.fielding,
      rating.breakdown.batting?.raw ?? null,
      rating.breakdown.bowling?.raw ?? null,
      rating.breakdown.fielding?.raw ?? null,
      rating.evidenceQuality,
      JSON.stringify(rating.breakdown),
      JSON.stringify(rating.sample),
      now,
    );
  }
  counts.ratingVersions = (db.prepare("SELECT COUNT(*) AS n FROM player_rating_versions").get() as { n: number }).n;
  counts.currentRatings = (db.prepare("SELECT COUNT(*) AS n FROM player_ratings").get() as { n: number }).n;

  const rulebookInsert = db.prepare(`
    INSERT INTO rulebooks (
      id, name, season, auction_type, status, purse_cap_lakh, purse_cap_verified, squad_min, squad_max,
      overseas_max, rtm_cards, increments_json, sources_json, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const rulebook of RULEBOOKS) {
    rulebookInsert.run(
      rulebook.id,
      rulebook.name,
      rulebook.season,
      rulebook.auctionType,
      rulebook.status,
      rulebook.purseCapLakh,
      rulebook.purseCapVerified ? 1 : 0,
      rulebook.squadMin,
      rulebook.squadMax,
      rulebook.overseasMax,
      rulebook.rtmCards,
      JSON.stringify(rulebook.increments),
      JSON.stringify({ sources: rulebook.sources, incrementsVerified: rulebook.incrementsVerified, rtmEnabled: rulebook.rtmEnabled }),
      JSON.stringify({ notes: rulebook.notes, limitations: rulebook.limitations }),
      now,
    );
  }
  counts.rulebooks = RULEBOOKS.length;

  const dataSourceInsert = db.prepare(`
    INSERT INTO data_sources (id, name, url, license, attribution, retrieved_at, record_count, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  dataSourceInsert.run(
    "cricsheet-ipl",
    "Cricsheet IPL ball-by-ball archive",
    "https://cricsheet.org/downloads/",
    "ODC-BY 1.0",
    "Cricsheet and its contributors",
    "2026-10-07",
    cs.matches.length,
    "1,243 IPL matches parsed from the supplied archive; super-over innings omitted from aggregate stats.",
  );
  dataSourceInsert.run(
    "openipl-2026",
    "openIPL 2026 season metadata",
    "https://github.com/sachin-dul/openIPL",
    "Data CC BY 4.0; code MIT",
    "openIPL contributors; underlying data from Cricsheet",
    "2026-10-07",
    openipl.stats.matchRows + openipl.stats.playerRows + openipl.stats.pointsRows,
    "Match umpires, DLS metadata, player roles, 2026 points table and registry cross-checks.",
  );
  dataSourceInsert.run(
    "auction-2026-sold",
    "IPL 2026 sold-player auction list (supplied)",
    null,
    "Supplied project dataset",
    "User-supplied IPL_Auction_2026_Sold_Player.csv",
    "2026-10-07",
    auction.players.length,
    "77 sold players with base prices, winning bids, buyers and capped/overseas labels. No unsold list supplied.",
  );
  dataSourceInsert.run(
    "wikidata",
    "Wikidata player enrichment",
    "https://query.wikidata.org/",
    "CC0 1.0",
    "Wikidata contributors",
    wiki?.retrievedAt ?? null,
    wiki ? Object.keys(wiki.records).length : 0,
    "Birth dates, bowling styles and country of citizenship via P2697 ESPNcricinfo ID. Two nationality anomalies overridden.",
  );
  counts.dataSources = 4;

  const roleCounts = [...catalog.values()].reduce<Record<string, number>>((acc, player) => {
    acc[player.role] = (acc[player.role] ?? 0) + 1;
    return acc;
  }, {});
  const ratedOvrs = [...current2026.values()]
    .map((rating) => rating.ovr)
    .filter((ovr): ovr is number => ovr !== null);
  const ratingDistribution = current2026.size
    ? {
        min: ratedOvrs.length > 0 ? Math.min(...ratedOvrs) : null,
        max: ratedOvrs.length > 0 ? Math.max(...ratedOvrs) : null,
        ratedPlayers: ratedOvrs.length,
        strong: [...current2026.values()].filter((rating) => rating.evidenceQuality === "strong").length,
        moderate: [...current2026.values()].filter((rating) => rating.evidenceQuality === "moderate").length,
        limited: [...current2026.values()].filter((rating) => rating.evidenceQuality === "limited").length,
      }
    : null;

  const linkCounts = identities.reduce<Record<string, number>>((acc, identity) => {
    acc[identity.method] = (acc[identity.method] ?? 0) + 1;
    return acc;
  }, {});

  const reportData = {
    generatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    ratingFormulaVersion: RATING_FORMULA_VERSION,
    ratingSeasons: RATING_SEASONS,
    counts,
    roleCounts,
    ratingDistribution,
    identityLinks: linkCounts,
    auctionOnlyPlayers: auctionOnlyCount(identities),
    identities: identities.map((identity) => ({
      auctionName: identity.auction.name,
      playerId: identity.playerId,
      cricsheetName: identity.matchName,
      method: identity.method,
      note: identity.note,
      buyer: identity.auction.teamName,
      basePriceLakh: identity.auction.basePriceLakh,
      winningBidLakh: identity.auction.winningBidLakh,
    })),
    sources: {
      cricsheet: { ...cs.stats, warnings: cs.warnings },
      openipl: { ...openipl.stats, warnings: openipl.warnings },
      auction: { ...auction.stats, warnings: auction.warnings },
      wikidata: {
        cachedRecords: wiki ? Object.keys(wiki.records).length : 0,
        retrievedAt: wiki?.retrievedAt ?? null,
      },
    },
    keyFigures: current2026.get("ba607b88")
      ? {
          viratKohli: current2026.get("ba607b88"),
        }
      : null,
    warnings,
  };

  const metaInsert = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
  metaInsert.run("schema_version", SCHEMA_VERSION);
  metaInsert.run("built_at", now);
  metaInsert.run("data_cutoff", "2026-10-07");
  metaInsert.run("rating_formula_version", RATING_FORMULA_VERSION);
  metaInsert.run("cricsheet_matches", String(counts.matches));
  metaInsert.run("deliveries", String(counts.deliveries));
  metaInsert.run("players", String(counts.players));
  metaInsert.run("auction_players", String(counts.auctionPlayers));
  metaInsert.run("resolved_matches", String(openipl.stats.matchRows));
  metaInsert.run("notes", "Ratings for a 2026 pre-auction scenario come from player_rating_versions.as_of_season = 2025.");

  const runInsert = db.prepare(`
    INSERT INTO import_runs (id, started_at, finished_at, status, warnings_count, errors_count, report_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  runInsert.run(
    `import-${Date.now()}`,
    globalThis.__importStartedAt ?? now,
    new Date().toISOString(),
    "success",
    warnings.length,
    0,
    JSON.stringify(reportData),
  );

  counts.importRuns = 1;
  return { ratingVersions, counts, reportData };
}

async function main(): Promise<void> {
  globalThis.__importStartedAt = new Date().toISOString();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "reports"), { recursive: true });
  if (fs.existsSync(BUILD_PATH)) fs.rmSync(BUILD_PATH, { force: true });

  const cricsheet = parseCricsheet(
    path.join(DATA_DIR, "sources", "cricsheet", "cricsheet-ipl-json-2026-10-07.zip"),
    path.join(DATA_DIR, "sources", "cricsheet", "people.csv"),
  );
  warnings.push(...cricsheet.warnings);
  const openipl = parseOpenIpl(path.join(DATA_DIR, "sources", "openipl-2026"), 2026);
  warnings.push(...openipl.warnings);
  const auction = parseAuctionCsv(path.join(DATA_DIR, "sources", "auction", "IPL_Auction_2026_Sold_Player.csv"));
  warnings.push(...auction.warnings);
  const wiki = loadWikidataCache();
  if (!wiki) warnings.push("Wikidata cache is unavailable; birth dates, bowling styles and some nationalities will be blank.");
  const team2026 = new Map(
    openipl.players
      .filter((player) => Boolean(player.cricsheetId))
      .map((player) => [player.cricsheetId as string, player.teamId]),
  );
  const { identities, warnings: identityWarnings } = resolveAuctionIdentities(auction.players, cricsheet, team2026);
  warnings.push(...identityWarnings);
  const { catalog } = buildPlayerCatalog(cricsheet, openipl, identities, wiki);

  const db = new Database(BUILD_PATH);
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = OFF");
  db.pragma("temp_store = MEMORY");
  try {
    db.exec(SCHEMA_SQL);
    const started = Date.now();
    const run = db.transaction(() => writeDatabase(db, cricsheet, openipl, auction, identities, catalog, wiki));
    const result = run();
    const fkErrors = db.pragma("foreign_key_check") as Array<Record<string, unknown>>;
    if (fkErrors.length > 0) {
      throw new Error(`Foreign key check failed with ${fkErrors.length} violation(s)`);
    }
    db.pragma("optimize");
    db.close();
    const buildMs = Date.now() - started;

    const report: Record<string, unknown> = {
      ...result.reportData,
      buildMs,
      databaseBytes: fs.statSync(BUILD_PATH).size,
      counts: result.counts,
    };
    if (fs.existsSync(DB_PATH)) {
      const backups = path.join(DATA_DIR, "backups");
      fs.mkdirSync(backups, { recursive: true });
      const backupName = `ipl-arena-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
      fs.copyFileSync(DB_PATH, path.join(backups, backupName));
      report.backup = path.relative(ROOT, path.join(backups, backupName));
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      if (fs.existsSync(DB_PATH + suffix)) fs.rmSync(DB_PATH + suffix, { force: true });
    }
    fs.renameSync(BUILD_PATH, DB_PATH);
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(SUMMARY_PATH, renderSummary(report));

    console.log("IPL Arena database built");
    console.log(`  players:        ${result.counts.players}`);
    console.log(`  matches:        ${result.counts.matches}`);
    console.log(`  deliveries:     ${result.counts.deliveries}`);
    console.log(`  career rows:    ${result.counts.careerStats}`);
    console.log(`  season rows:    ${result.counts.seasonStats}`);
    console.log(`  auction lots:   ${result.counts.auctionPlayers}`);
    console.log(`  rating rows:    ${result.counts.ratingVersions}`);
    console.log(`  build time:     ${buildMs} ms`);
    console.log(`  report:         ${path.relative(ROOT, REPORT_PATH)}`);
    console.log(`  warnings:       ${warnings.length}`);
    if (warnings.length > 0) {
      for (const warning of warnings.slice(0, 10)) console.warn(`  - ${warning}`);
    }
  } catch (error) {
    try {
      db.close();
    } catch {
      // ignore close failures after a build error
    }
    if (fs.existsSync(BUILD_PATH)) fs.rmSync(BUILD_PATH, { force: true });
    throw error;
  }
}

function renderSummary(report: Record<string, unknown>): string {
  const counts = report.counts as Record<string, number>;
  const roles = report.roleCounts as Record<string, number>;
  const links = report.identityLinks as Record<string, number>;
  const sourceStats = report.sources as Record<string, Record<string, unknown>>;
  return `# Import summary

Generated: ${String(report.generatedAt)}

## Records

| Table | Rows |
| --- | ---: |
| Players | ${counts.players} |
| Matches | ${counts.matches} |
| Deliveries | ${counts.deliveries} |
| Career stat rows | ${counts.careerStats} |
| Season stat rows | ${counts.seasonStats} |
| Player-match rows | ${counts.matchStats} |
| Auction players | ${counts.auctionPlayers} |
| Rating versions | ${counts.ratingVersions} |
| Current ratings | ${counts.currentRatings} |

## Source reconciliation

- Cricsheet: ${String(sourceStats.cricsheet.matches)} matches, ${String(sourceStats.cricsheet.deliveries)} deliveries, ${String(sourceStats.cricsheet.files)} files.
- openIPL: ${String(sourceStats.openipl.matchRows)} matches, ${String(sourceStats.openipl.playerRows)} player rows, ${String(sourceStats.openipl.pointsRows)} points rows.
- Auction: ${String(sourceStats.auction.rows)} sold players, ₹${String(sourceStats.auction.totalSpendLakh)} lakh total spend.
- Wikidata: ${String(sourceStats.wikidata.cachedRecords)} cached player records.

## Auction identity links

- Exact: ${links.exact ?? 0}
- Fuzzy: ${links.fuzzy ?? 0}
- Manual: ${links.manual ?? 0}
- Auction-only: ${links.auction_only ?? 0}

## Roles

${Object.entries(roles)
  .map(([role, count]) => `- ${role}: ${count}`)
  .join("\n")}

Warnings: ${(report.warnings as string[]).length}. See ${path.basename(REPORT_PATH)} for the full audit.
`;
}

declare global {
  var __importStartedAt: string | undefined;
}

void main();
