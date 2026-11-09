import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import {
  type Aggregate,
  type PhaseBat,
  type PhaseBowl,
  emptyAggregate,
  mergeAggregate,
  phaseForOver,
} from "@/lib/data/stats";
import { getFranchise, teamIdFromName } from "@/lib/teams";
import { slugify } from "@/lib/data/names";
import { parseCsvObjects } from "./csv";

type RawFielder = { name?: string; substitute?: boolean };
type RawWicket = {
  kind?: string;
  player_out?: string;
  fielders?: RawFielder[];
};
type RawDelivery = {
  batter?: string;
  bowler?: string;
  non_striker?: string;
  runs?: { batter?: number; extras?: number; total?: number; non_boundary?: boolean };
  extras?: {
    byes?: number;
    legbyes?: number;
    wides?: number;
    noballs?: number;
    penalty?: number;
  };
  wickets?: RawWicket[];
  replacements?: {
    match?: { in?: string; out?: string; team?: string; reason?: string }[];
  };
  actual_delivery?: string;
};
type RawInnings = {
  team?: string;
  super_over?: boolean;
  overs?: { over?: number; deliveries?: RawDelivery[] }[];
};
type RawMatch = {
  info?: {
    city?: string;
    dates?: string[];
    event?: { name?: string; match_number?: number | string; stage?: string };
    outcome?: {
      winner?: string;
      result?: string;
      eliminator?: string;
      method?: string;
      by?: { runs?: number; wickets?: number };
    };
    player_of_match?: string[];
    players?: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
    season?: string | number;
    teams?: string[];
    toss?: { winner?: string; decision?: string };
    venue?: string;
  };
  innings?: RawInnings[];
};

export type ParsedDelivery = {
  inningsNumber: number;
  overNumber: number;
  ballNumber: number;
  actualDelivery: string | null;
  batterId: string;
  bowlerId: string;
  nonStrikerId: string;
  runsBatter: number;
  runsExtras: number;
  runsTotal: number;
  extrasJson: string | null;
  wicketKind: string | null;
  playerOutId: string | null;
  fieldersJson: string | null;
  isLegal: number;
  phase: "pp" | "mid" | "death";
};

export type ParsedPlayerMatch = {
  playerId: string;
  teamId: string;
  opponentTeamId: string;
  agg: Aggregate;
  dismissal: string | null;
  notOut: number;
};

export type ParsedInningsSummary = {
  teamId: string;
  runs: number;
  wickets: number;
  balls: number;
  overs: number;
};

export type ParsedMatch = {
  id: string;
  sourceId: string;
  season: number;
  matchNumber: number | null;
  date: string;
  venue: string | null;
  city: string | null;
  team1Id: string;
  team2Id: string;
  tossWinnerId: string | null;
  tossDecision: string | null;
  winnerId: string | null;
  result: string;
  winByRuns: number | null;
  winByWickets: number | null;
  playerOfMatch: string | null;
  playerOfMatchId: string | null;
  team1Score: string | null;
  team2Score: string | null;
  team1Overs: number | null;
  team2Overs: number | null;
  stage: string | null;
  dls: number;
  innings: ParsedInningsSummary[];
  playerStats: ParsedPlayerMatch[];
  deliveries: ParsedDelivery[];
};

export type CricsheetPerson = {
  id: string;
  name: string;
  keyCricinfo: string | null;
};

export type SeasonTeamAggregate = {
  playerId: string;
  season: number;
  teamId: string;
  agg: Aggregate;
};

export type CricsheetImport = {
  matches: ParsedMatch[];
  people: Map<string, CricsheetPerson>;
  registry: Map<string, CricsheetPerson>;
  career: Map<string, Aggregate>;
  seasons: Map<string, SeasonTeamAggregate>;
  sources: Map<string, { id: string; keyCricinfo: string | null }>;
  warnings: string[];
  stats: {
    files: number;
    matches: number;
    deliveries: number;
    superOversSkipped: number;
    unknownTeams: number;
    unmatchedPeople: number;
  };
};

const BOWLER_WICKET_KINDS = new Set([
  "bowled",
  "caught",
  "lbw",
  "stumped",
  "hit wicket",
  "caught and bowled",
]);

const CACHE_PATH = path.join(process.cwd(), ".cache", "cricsheet");

function normalizeSeason(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = String(raw).trim();
  const split = /^(\d{4})\/(\d{2,4})$/.exec(value);
  if (split) {
    const first = split[1];
    const second = split[2];
    if (second.length === 2) return Number(`${first.slice(0, 2)}${second}`);
    return Number(second);
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTeam(rawName: string | undefined, warnings: string[]): string | null {
  if (!rawName) return null;
  const id = teamIdFromName(rawName);
  if (!getFranchise(id)) {
    warnings.push(`Unknown team name in Cricsheet data: "${rawName}"`);
    return null;
  }
  return id;
}

function dismissalText(
  wicket: RawWicket,
  bowler: string | undefined,
  fielders: string[],
): { text: string; dismissed: boolean } {
  const kind = wicket.kind ?? "unknown";
  const fielder = fielders[0];
  if (kind === "retired hurt") return { text: "retired hurt", dismissed: false };
  if (kind === "retired out") return { text: "retired out", dismissed: true };
  if (kind === "bowled") return { text: `b ${bowler ?? "unknown"}`, dismissed: true };
  if (kind === "lbw") return { text: `lbw b ${bowler ?? "unknown"}`, dismissed: true };
  if (kind === "caught and bowled") return { text: `c & b ${bowler ?? "unknown"}`, dismissed: true };
  if (kind === "caught") {
    return { text: `c ${fielder ?? "unknown"} b ${bowler ?? "unknown"}`, dismissed: true };
  }
  if (kind === "stumped") {
    return { text: `st ${fielder ?? "unknown"} b ${bowler ?? "unknown"}`, dismissed: true };
  }
  if (kind === "hit wicket") return { text: `hit wicket b ${bowler ?? "unknown"}`, dismissed: true };
  if (kind === "run out") {
    return { text: `run out (${fielders.length ? fielders.join("/") : "unknown"})`, dismissed: true };
  }
  return { text: kind.replace(/_/g, " "), dismissed: true };
}

function displayScore(runs: number, wickets: number): string {
  return `${runs}/${wickets}`;
}

function oversValue(balls: number): number {
  return Number(`${Math.floor(balls / 6)}.${balls % 6}`);
}

function ensureExtracted(zipPath: string): string {
  const cached = fs.existsSync(CACHE_PATH)
    ? fs.readdirSync(CACHE_PATH).filter((file) => file.endsWith(".json")).length
    : 0;
  if (cached >= 1200) return CACHE_PATH;
  fs.mkdirSync(CACHE_PATH, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(CACHE_PATH, true);
  return CACHE_PATH;
}

function parsePeople(csvPath: string): {
  byId: Map<string, { keyCricinfo: string | null; name: string }>;
  byName: Map<string, { id: string; keyCricinfo: string | null }[]>;
} {
  const byId = new Map<string, { keyCricinfo: string | null; name: string }>();
  const byName = new Map<string, { id: string; keyCricinfo: string | null }[]>();
  if (!fs.existsSync(csvPath)) return { byId, byName };
  const rows = parseCsvObjects(fs.readFileSync(csvPath, "utf8"));
  for (const row of rows) {
    const id = row.identifier?.trim();
    if (!id) continue;
    const name = row.name?.trim() || id;
    const keyCricinfo = row.key_cricinfo?.trim() || null;
    byId.set(id, { keyCricinfo, name });
    const existing = byName.get(name) ?? [];
    existing.push({ id, keyCricinfo });
    byName.set(name, existing);
  }
  return { byId, byName };
}

type BattingAccumulator = {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  batted: boolean;
  dismissed: boolean;
  dismissal: string | null;
  pp: PhaseBat;
  mid: PhaseBat;
  death: PhaseBat;
};

type BowlingAccumulator = {
  balls: number;
  runs: number;
  wickets: number;
  dots: number;
  innings: number;
  pp: PhaseBowl;
  mid: PhaseBowl;
  death: PhaseBowl;
};

function newBatting(): BattingAccumulator {
  return {
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    batted: false,
    dismissed: false,
    dismissal: null,
    pp: { runs: 0, balls: 0, dismissals: 0, fours: 0, sixes: 0 },
    mid: { runs: 0, balls: 0, dismissals: 0, fours: 0, sixes: 0 },
    death: { runs: 0, balls: 0, dismissals: 0, fours: 0, sixes: 0 },
  };
}

function newBowling(): BowlingAccumulator {
  return {
    balls: 0,
    runs: 0,
    wickets: 0,
    dots: 0,
    innings: 0,
    pp: { balls: 0, runs: 0, wickets: 0, dots: 0 },
    mid: { balls: 0, runs: 0, wickets: 0, dots: 0 },
    death: { balls: 0, runs: 0, wickets: 0, dots: 0 },
  };
}

export function parseCricsheet(zipPath: string, peoplePath: string): CricsheetImport {
  const directory = ensureExtracted(zipPath);
  const peopleTable = parsePeople(peoplePath);
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort();

  const matches: ParsedMatch[] = [];
  const people = new Map<string, CricsheetPerson>();
  const career = new Map<string, Aggregate>();
  const seasons = new Map<string, SeasonTeamAggregate>();
  const warnings: string[] = [];
  let deliveryCount = 0;
  let superOversSkipped = 0;
  let unknownTeams = 0;
  let unmatchedPeople = 0;
  const unknownTeamSet = new Set<string>();

  const registerPerson = (name: string, localRegistry: Record<string, string>): CricsheetPerson => {
    let id = localRegistry[name];
    let keyCricinfo: string | null = null;
    if (id) {
      keyCricinfo = peopleTable.byId.get(id)?.keyCricinfo ?? null;
    } else {
      const candidates = peopleTable.byName.get(name);
      if (candidates && candidates.length === 1) {
        id = candidates[0].id;
        keyCricinfo = candidates[0].keyCricinfo;
      } else {
        id = `csname-${slugify(name) || "unknown"}`;
        unmatchedPeople += 1;
      }
    }
    if (!people.has(id)) {
      people.set(id, { id, name, keyCricinfo });
    }
    return people.get(id)!;
  };

  for (const file of files) {
    const sourceId = file.replace(/\.json$/, "");
    let raw: RawMatch;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")) as RawMatch;
    } catch (error) {
      warnings.push(`Could not parse ${file}: ${(error as Error).message}`);
      continue;
    }
    const info = raw.info;
    if (!info) {
      warnings.push(`Missing info block in ${file}`);
      continue;
    }
    const date = info.dates?.[0];
    const season = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? Number(date.slice(0, 4))
      : normalizeSeason(info.season);
    if (!season || !date) {
      warnings.push(`Missing season or date in ${file}`);
      continue;
    }
    const teamNames = info.teams ?? [];
    if (teamNames.length < 2) {
      warnings.push(`Expected two teams in ${file}`);
      continue;
    }
    const team1Id = resolveTeam(teamNames[0], warnings);
    const team2Id = resolveTeam(teamNames[1], warnings);
    if (!team1Id || !team2Id) {
      unknownTeams += 1;
      teamNames.forEach((name) => unknownTeamSet.add(name));
      continue;
    }
    const localRegistry = info.registry?.people ?? {};
    const teamIdByPlayerName = new Map<string, string>();
    for (const [teamName, names] of Object.entries(info.players ?? {})) {
      const teamId = resolveTeam(teamName, warnings);
      if (!teamId) continue;
      for (const name of names) teamIdByPlayerName.set(name, teamId);
    }

    const battingById = new Map<string, BattingAccumulator>();
    const bowlingById = new Map<string, BowlingAccumulator>();
    const fieldingById = new Map<
      string,
      { catches: number; runOuts: number; stumpings: number }
    >();
    const teamByPlayerId = new Map<string, string>();
    const participants = new Set<string>();
    const inningsSummaries = new Map<
      string,
      { runs: number; wickets: number; balls: number }
    >();
    const deliveries: ParsedDelivery[] = [];

    const bindTeam = (playerId: string, teamId: string) => {
      const existing = teamByPlayerId.get(playerId);
      if (!existing) teamByPlayerId.set(playerId, teamId);
      else if (existing !== teamId) {
        warnings.push(`Player ${playerId} appears for ${existing} and ${teamId} in match ${sourceId}`);
      }
    };

    const getBatting = (playerId: string): BattingAccumulator => {
      let row = battingById.get(playerId);
      if (!row) {
        row = newBatting();
        battingById.set(playerId, row);
      }
      return row;
    };

    const getBowling = (playerId: string): BowlingAccumulator => {
      let row = bowlingById.get(playerId);
      if (!row) {
        row = newBowling();
        bowlingById.set(playerId, row);
      }
      return row;
    };

    const fielding = (playerId: string) => {
      let row = fieldingById.get(playerId);
      if (!row) {
        row = { catches: 0, runOuts: 0, stumpings: 0 };
        fieldingById.set(playerId, row);
      }
      return row;
    };

    for (const [inningsIndex, innings] of (raw.innings ?? []).entries()) {
      if (innings.super_over) {
        superOversSkipped += 1;
        continue;
      }
      const battingTeamId = resolveTeam(innings.team, warnings);
      if (!battingTeamId) continue;
      const bowlingTeamId = battingTeamId === team1Id ? team2Id : team1Id;
      const summary = inningsSummaries.get(battingTeamId) ?? { runs: 0, wickets: 0, balls: 0 };

      for (const overBlock of innings.overs ?? []) {
        const over = overBlock.over ?? 0;
        const phase = phaseForOver(over);
        for (const [ballIndex, delivery] of (overBlock.deliveries ?? []).entries()) {
          const batterName = delivery.batter;
          const bowlerName = delivery.bowler;
          const nonStrikerName = delivery.non_striker;
          if (!batterName || !bowlerName) {
            warnings.push(`Delivery missing batter/bowler in match ${sourceId}`);
            continue;
          }
          const batter = registerPerson(batterName, localRegistry);
          const bowler = registerPerson(bowlerName, localRegistry);
          const nonStriker = nonStrikerName
            ? registerPerson(nonStrikerName, localRegistry)
            : null;
          bindTeam(batter.id, teamIdByPlayerName.get(batterName) ?? battingTeamId);
          bindTeam(bowler.id, teamIdByPlayerName.get(bowlerName) ?? bowlingTeamId);
          if (nonStriker) {
            bindTeam(nonStriker.id, teamIdByPlayerName.get(nonStrikerName!) ?? battingTeamId);
          }
          participants.add(batter.id);
          participants.add(bowler.id);
          if (nonStriker) participants.add(nonStriker.id);

          const runsBatter = delivery.runs?.batter ?? 0;
          const runsExtras = delivery.runs?.extras ?? 0;
          const runsTotal = delivery.runs?.total ?? runsBatter + runsExtras;
          const isBoundary = !delivery.runs?.non_boundary;
          const extras = delivery.extras ?? {};
          const wides = extras.wides ?? 0;
          const noballs = extras.noballs ?? 0;
          const isLegal = wides === 0 && noballs === 0;

          const bat = getBatting(batter.id);
          bat.batted = true;
          bat.runs += runsBatter;
          if (isLegal) bat.balls += 1;
          if (isBoundary && runsBatter === 4) bat.fours += 1;
          if (isBoundary && runsBatter === 6) bat.sixes += 1;
          const batPhase = phase === "pp" ? bat.pp : phase === "mid" ? bat.mid : bat.death;
          batPhase.runs += runsBatter;
          if (isLegal) batPhase.balls += 1;
          if (isBoundary && runsBatter === 4) batPhase.fours += 1;
          if (isBoundary && runsBatter === 6) batPhase.sixes += 1;
          if (nonStriker) getBatting(nonStriker.id).batted = true;

          const bowl = getBowling(bowler.id);
          if (isLegal) bowl.balls += 1;
          bowl.runs += runsBatter + wides + noballs;
          if (isLegal && runsTotal === 0) bowl.dots += 1;
          const bowlPhase = phase === "pp" ? bowl.pp : phase === "mid" ? bowl.mid : bowl.death;
          if (isLegal) bowlPhase.balls += 1;
          bowlPhase.runs += runsBatter + wides + noballs;
          if (isLegal && runsTotal === 0) bowlPhase.dots += 1;

          summary.runs += runsTotal;
          if (isLegal) summary.balls += 1;

          let wicketKind: string | null = null;
          let playerOutId: string | null = null;
          let fieldersJson: string | null = null;
          for (const wicket of delivery.wickets ?? []) {
            const kind = wicket.kind ?? "unknown";
            wicketKind = wicketKind ?? kind;
            const outName = wicket.player_out;
            if (!outName) continue;
            const outPlayer = registerPerson(outName, localRegistry);
            bindTeam(outPlayer.id, teamIdByPlayerName.get(outName) ?? battingTeamId);
            participants.add(outPlayer.id);
            playerOutId = outPlayer.id;
            const fielderNames = (wicket.fielders ?? [])
              .map((fielder) => fielder.name)
              .filter((name): name is string => Boolean(name));
            const fielderIds = fielderNames.map((name) => registerPerson(name, localRegistry));
            const fielderText = fielderNames.map((name, index) => {
              const substitute = wicket.fielders?.[index]?.substitute;
              return substitute ? `${name} (sub)` : name;
            });
            const dismissal = dismissalText(wicket, bowlerName, fielderText);
            const outBat = getBatting(outPlayer.id);
            outBat.batted = true;
            if (kind === "retired hurt") {
              if (!outBat.dismissal) outBat.dismissal = "retired hurt";
            } else if (!outBat.dismissed) {
              outBat.dismissed = true;
              outBat.dismissal = dismissal.text;
              if (phase === "pp") outBat.pp.dismissals += 1;
              else if (phase === "mid") outBat.mid.dismissals += 1;
              else outBat.death.dismissals += 1;
              summary.wickets += 1;
            }

            if (kind === "caught") {
              for (const fielder of fielderIds) {
                bindTeam(
                  fielder.id,
                  teamIdByPlayerName.get(people.get(fielder.id)?.name ?? "") ?? bowlingTeamId,
                );
                participants.add(fielder.id);
                fielding(fielder.id).catches += 1;
              }
            } else if (kind === "caught and bowled") {
              fielding(bowler.id).catches += 1;
            } else if (kind === "stumped" && fielderIds[0]) {
              fielding(fielderIds[0].id).stumpings += 1;
              bindTeam(
                fielderIds[0].id,
                teamIdByPlayerName.get(fielderNames[0]) ?? bowlingTeamId,
              );
              participants.add(fielderIds[0].id);
            } else if (kind === "run out" && fielderIds[0]) {
              fielding(fielderIds[0].id).runOuts += 1;
              bindTeam(
                fielderIds[0].id,
                teamIdByPlayerName.get(fielderNames[0]) ?? bowlingTeamId,
              );
              participants.add(fielderIds[0].id);
            }

            if (BOWLER_WICKET_KINDS.has(kind)) {
              bowl.wickets += 1;
              bowlPhase.wickets += 1;
            }
            fieldersJson = fielderText.length ? JSON.stringify(fielderText) : null;
          }

          deliveries.push({
            inningsNumber: inningsIndex + 1,
            overNumber: over,
            ballNumber: ballIndex + 1,
            actualDelivery: delivery.actual_delivery ?? null,
            batterId: batter.id,
            bowlerId: bowler.id,
            nonStrikerId: nonStriker?.id ?? "",
            runsBatter,
            runsExtras,
            runsTotal,
            extrasJson: Object.keys(extras).length ? JSON.stringify(extras) : null,
            wicketKind,
            playerOutId,
            fieldersJson,
            isLegal: isLegal ? 1 : 0,
            phase,
          });
        }
      }
      inningsSummaries.set(battingTeamId, summary);
    }
    deliveryCount += deliveries.length;

    const outcome = info.outcome ?? {};
    const winnerName = outcome.winner ?? outcome.eliminator;
    const winnerId = winnerName ? resolveTeam(winnerName, warnings) : null;
    if (winnerName && !winnerId) unknownTeams += 1;
    const matchNumberRaw = info.event?.match_number;
    const matchNumber =
      matchNumberRaw !== undefined && matchNumberRaw !== null && Number.isFinite(Number(matchNumberRaw))
        ? Number(matchNumberRaw)
        : null;
    let result = "No result";
    if (winnerName && outcome.by?.runs !== undefined) {
      result = `${winnerName} won by ${outcome.by.runs} run${outcome.by.runs === 1 ? "" : "s"}`;
    } else if (winnerName && outcome.by?.wickets !== undefined) {
      result = `${winnerName} won by ${outcome.by.wickets} wicket${outcome.by.wickets === 1 ? "" : "s"}`;
    } else if (winnerName) {
      result = outcome.result === "tie" ? `Match tied; ${winnerName} won the Super Over` : `${winnerName} won`;
    } else if (outcome.result === "tie") {
      result = "Match tied";
    }
    const playerOfMatchName = info.player_of_match?.[0] ?? null;
    const playerOfMatch = playerOfMatchName
      ? registerPerson(playerOfMatchName, localRegistry)
      : null;
    const dls = /D\/L|DLS/i.test(outcome.method ?? "") ? 1 : 0;

    const playerStats: ParsedPlayerMatch[] = [];
    for (const playerId of participants) {
      const teamId = teamByPlayerId.get(playerId);
      if (!teamId) {
        warnings.push(`Missing team assignment for ${people.get(playerId)?.name ?? playerId} in ${sourceId}`);
        continue;
      }
      const opponentTeamId = teamId === team1Id ? team2Id : team1Id;
      const bat = battingById.get(playerId);
      const bowl = bowlingById.get(playerId);
      const field = fieldingById.get(playerId) ?? { catches: 0, runOuts: 0, stumpings: 0 };
      const agg = emptyAggregate();
      agg.matches = 1;
      if (bat) {
        agg.inningsBat = bat.batted ? 1 : 0;
        agg.runs = bat.runs;
        agg.ballsFaced = bat.balls;
        agg.fours = bat.fours;
        agg.sixes = bat.sixes;
        agg.dismissals = bat.dismissed ? 1 : 0;
        agg.notOuts = bat.batted && !bat.dismissed ? 1 : 0;
        agg.highScore = bat.runs;
        agg.highScoreNotOut = bat.batted && !bat.dismissed;
        if (bat.runs >= 100) agg.hundreds = 1;
        else if (bat.runs >= 50) agg.fifties = 1;
        if (bat.runs >= 20) agg.twentyPlus = 1;
        agg.ppBat = { ...bat.pp, dismissals: bat.pp.dismissals };
        agg.midBat = { ...bat.mid };
        agg.deathBat = { ...bat.death };
      }
      if (bowl) {
        agg.inningsBowl = bowl.balls > 0 ? 1 : 0;
        agg.ballsBowled = bowl.balls;
        agg.runsConceded = bowl.runs;
        agg.wickets = bowl.wickets;
        agg.dots = bowl.dots;
        agg.bestBowlingWickets = bowl.wickets > 0 ? bowl.wickets : null;
        agg.bestBowlingRuns = bowl.wickets > 0 ? bowl.runs : null;
        agg.ppBowl = { ...bowl.pp };
        agg.midBowl = { ...bowl.mid };
        agg.deathBowl = { ...bowl.death };
      }
      agg.catches = field.catches;
      agg.runOuts = field.runOuts;
      agg.stumpings = field.stumpings;
      const dismissal = bat?.batted ? (bat.dismissed ? bat.dismissal : "not out") : null;
      playerStats.push({
        playerId,
        teamId,
        opponentTeamId,
        agg,
        dismissal,
        notOut: bat?.batted && !bat.dismissed ? 1 : 0,
      });
      const careerAgg = career.get(playerId) ?? emptyAggregate();
      mergeAggregate(careerAgg, agg);
      career.set(playerId, careerAgg);
      const seasonKey = `${playerId}|${season}|${teamId}`;
      const existingSeason = seasons.get(seasonKey);
      if (existingSeason) {
        mergeAggregate(existingSeason.agg, agg);
      } else {
        seasons.set(seasonKey, {
          playerId,
          season,
          teamId,
          agg: structuredCloneAggregate(agg),
        });
      }
    }

    const team1Summary = inningsSummaries.get(team1Id);
    const team2Summary = inningsSummaries.get(team2Id);
    const summaryToRecord = (summary: { runs: number; wickets: number; balls: number } | undefined, teamId: string): ParsedInningsSummary => ({
      teamId,
      runs: summary?.runs ?? 0,
      wickets: summary?.wickets ?? 0,
      balls: summary?.balls ?? 0,
      overs: oversValue(summary?.balls ?? 0),
    });

    matches.push({
      id: `cs-${sourceId}`,
      sourceId,
      season,
      matchNumber,
      date,
      venue: info.venue?.trim() || null,
      city: info.city?.trim() || null,
      team1Id,
      team2Id,
      tossWinnerId: info.toss?.winner ? resolveTeam(info.toss.winner, warnings) : null,
      tossDecision: info.toss?.decision ?? null,
      winnerId,
      result,
      winByRuns: outcome.by?.runs ?? null,
      winByWickets: outcome.by?.wickets ?? null,
      playerOfMatch: playerOfMatchName,
      playerOfMatchId: playerOfMatch?.id ?? null,
      team1Score: team1Summary ? displayScore(team1Summary.runs, team1Summary.wickets) : null,
      team2Score: team2Summary ? displayScore(team2Summary.runs, team2Summary.wickets) : null,
      team1Overs: team1Summary ? oversValue(team1Summary.balls) : null,
      team2Overs: team2Summary ? oversValue(team2Summary.balls) : null,
      stage: info.event?.stage ?? null,
      dls,
      innings: [
        summaryToRecord(team1Summary, team1Id),
        summaryToRecord(team2Summary, team2Id),
      ],
      playerStats,
      deliveries,
    });
  }

  return {
    matches,
    people,
    registry: new Map(
      [...peopleTable.byId.entries()].map(([id, row]) => [
        id,
        { id, name: row.name, keyCricinfo: row.keyCricinfo },
      ]),
    ),
    career,
    seasons,
    sources: new Map(
      [...people.values()].map((person) => [person.id, { id: person.id, keyCricinfo: person.keyCricinfo }]),
    ),
    warnings,
    stats: {
      files: files.length,
      matches: matches.length,
      deliveries: deliveryCount,
      superOversSkipped,
      unknownTeams,
      unmatchedPeople,
    },
  };
}

function structuredCloneAggregate(agg: Aggregate): Aggregate {
  return {
    ...agg,
    ppBat: { ...agg.ppBat },
    midBat: { ...agg.midBat },
    deathBat: { ...agg.deathBat },
    ppBowl: { ...agg.ppBowl },
    midBowl: { ...agg.midBowl },
    deathBowl: { ...agg.deathBowl },
  };
}
