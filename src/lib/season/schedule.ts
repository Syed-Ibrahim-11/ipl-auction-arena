import type { SeasonStage } from "./types";

export type ScheduleTemplateMatch = {
  id: string;
  matchNumber: number;
  date: string;
  venue: string | null;
  city: string | null;
  team1Id: string;
  team2Id: string;
  stage: string;
};

export type SeasonFixtureSeed = {
  id: string;
  matchNumber: number;
  stage: SeasonStage;
  round: number;
  date: string;
  venue: string | null;
  city: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  templateMatchId: string | null;
};

const VENUE_HOME_TEAM: Array<{ pattern: RegExp; teamId: string }> = [
  { pattern: /bengaluru|bangalore|chinnaswamy/i, teamId: "royal-challengers-bengaluru" },
  { pattern: /mumbai|wankhede|brabourne|navi mumbai/i, teamId: "mumbai-indians" },
  { pattern: /chennai|chepauk/i, teamId: "chennai-super-kings" },
  { pattern: /kolkata|eden gardens/i, teamId: "kolkata-knight-riders" },
  { pattern: /hyderabad|uppal/i, teamId: "sunrisers-hyderabad" },
  { pattern: /delhi|arun jaitley|kotla|visakhapatnam/i, teamId: "delhi-capitals" },
  { pattern: /jaipur|sawai mansingh|guwahati|barsapara/i, teamId: "rajasthan-royals" },
  { pattern: /mohali|new chandigarh|mullanpur|dharamsala|hpca/i, teamId: "punjab-kings" },
  { pattern: /ahmedabad|narendra modi|motera/i, teamId: "gujarat-titans" },
  { pattern: /lucknow|ekana/i, teamId: "lucknow-super-giants" },
];

function inferHomeTeam(template: ScheduleTemplateMatch): { homeTeamId: string; awayTeamId: string; inferred: boolean } {
  const haystack = `${template.city ?? ""} ${template.venue ?? ""}`;
  const match = VENUE_HOME_TEAM.find((entry) => entry.pattern.test(haystack));
  if (match && (match.teamId === template.team1Id || match.teamId === template.team2Id)) {
    return {
      homeTeamId: match.teamId,
      awayTeamId: match.teamId === template.team1Id ? template.team2Id : template.team1Id,
      inferred: true,
    };
  }
  return { homeTeamId: template.team1Id, awayTeamId: template.team2Id, inferred: false };
}

function normaliseStage(raw: string | null | undefined): SeasonStage {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("qualifier 1")) return "Qualifier 1";
  if (value.includes("qualifier 2")) return "Qualifier 2";
  if (value.includes("eliminator")) return "Eliminator";
  if (value.includes("final")) return "Final";
  return "league";
}

const TEAM_COUNT = 10;
const LEAGUE_MATCHES = 70;
const MATCHES_PER_TEAM = 14;
const PAIRINGS = (TEAM_COUNT * (TEAM_COUNT - 1)) / 2;

function validateLeagueSchedule(league: ScheduleTemplateMatch[]) {
  if (league.length !== LEAGUE_MATCHES) {
    throw new Error(`The schedule template has ${league.length} league matches; ${LEAGUE_MATCHES} are required.`);
  }
  const matchNumbers = new Set<number>();
  const teams = new Set<string>();
  const perTeam = new Map<string, number>();
  const pairings = new Map<string, number>();
  for (const template of league) {
    if (matchNumbers.has(template.matchNumber)) {
      throw new Error(`Duplicate match number ${template.matchNumber} in the schedule template.`);
    }
    matchNumbers.add(template.matchNumber);
    if (template.team1Id === template.team2Id) {
      throw new Error(`Match ${template.matchNumber} pairs a team with itself (${template.team1Id}).`);
    }
    for (const teamId of [template.team1Id, template.team2Id]) {
      teams.add(teamId);
      perTeam.set(teamId, (perTeam.get(teamId) ?? 0) + 1);
    }
    const pair = [template.team1Id, template.team2Id].sort().join("|");
    pairings.set(pair, (pairings.get(pair) ?? 0) + 1);
  }
  if (teams.size !== TEAM_COUNT) {
    throw new Error(`The league template covers ${teams.size} teams; ${TEAM_COUNT} are required.`);
  }
  for (const [teamId, count] of perTeam) {
    if (count !== MATCHES_PER_TEAM) {
      throw new Error(`${teamId} plays ${count} league matches in the template; ${MATCHES_PER_TEAM} are required.`);
    }
  }
  if (pairings.size !== PAIRINGS) {
    throw new Error(`The league template has ${pairings.size} unique pairings; ${PAIRINGS} are required.`);
  }
  // Seventy matches at fourteen per team means each pairing can only meet once or twice.
  // A full double round-robin would need ninety matches, so "twice for every pair" is not
  // representable here; what matters is that no pairing is missing and none is overplayed.
  for (const [pair, count] of pairings) {
    if (count < 1 || count > 2) {
      throw new Error(`Pairing ${pair} appears ${count} times; each pairing must meet once or twice in 70 matches.`);
    }
  }
}

export function buildSeasonFixtures(seasonId: string, templates: ScheduleTemplateMatch[]): SeasonFixtureSeed[] {
  const sorted = [...templates].sort((a, b) => a.matchNumber - b.matchNumber);
  const league = sorted.filter((template) => normaliseStage(template.stage) === "league");
  const playoffs = sorted.filter((template) => normaliseStage(template.stage) !== "league");
  if (playoffs.length !== 4) {
    throw new Error(`The schedule template has ${playoffs.length} playoff rows; 4 are required.`);
  }
  const stageCounts = new Map<SeasonStage, number>();
  for (const template of playoffs) {
    const stage = normaliseStage(template.stage);
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
  }
  for (const stage of ["Qualifier 1", "Eliminator", "Qualifier 2", "Final"] as const) {
    if (stageCounts.get(stage) !== 1) {
      throw new Error(`The playoff template needs exactly one ${stage} row.`);
    }
  }
  validateLeagueSchedule(league);

  return sorted.map((template, index) => {
    const stage = normaliseStage(template.stage);
    const isLeague = stage === "league";
    const home = isLeague ? inferHomeTeam(template) : { homeTeamId: null, awayTeamId: null };
    return {
      id: `${seasonId}-m${template.matchNumber}`,
      matchNumber: template.matchNumber,
      stage,
      round: isLeague ? Math.floor(index / 5) + 1 : 1,
      date: template.date,
      venue: template.venue,
      city: template.city,
      homeTeamId: home.homeTeamId,
      awayTeamId: home.awayTeamId,
      templateMatchId: template.id,
    };
  });
}

export function scheduleSource(archiveSeason: number): string {
  return `IPL ${archiveSeason} match archive (openIPL / Cricsheet)`;
}

export function scheduleNote(archiveSeason: number): string {
  return `League dates, venues and pairings follow the ${archiveSeason} match archive in this workspace (Cricsheet ball-by-ball data with openIPL match metadata); home and away are inferred from venue cities where needed. The master prompt's own fixtures.csv attachment was not supplied, so the archive is the schedule template. The league is 70 matches at 14 per team, so the 45 pairings meet once or twice — a complete home-and-away double round-robin would need 90 matches and 18 per team. Playoff dates and venues are real ${archiveSeason} slots; playoff teams are seeded from your simulated league table, not from the real tournament. Matchweeks are a simulator grouping, not an official IPL label.`;
}
