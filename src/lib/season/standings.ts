import type { StandingRow } from "./types";

export type StandingsTeam = {
  id: string;
  name: string;
  shortName: string;
  primary: string;
};

export type StandingsResult = {
  teamId: string;
  opponentId: string;
  matchNumber: number;
  date: string;
  won: boolean;
  tied: boolean;
  noResult: boolean;
  runsFor: number;
  ballsFaced: number;
  runsAgainst: number;
  ballsBowled: number;
};

export function computeStandings(
  teams: StandingsTeam[],
  results: StandingsResult[],
  leagueComplete: boolean,
): StandingRow[] {
  const rows = teams.map((team) => {
    const matches = results
      .filter((result) => result.teamId === team.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.matchNumber - b.matchNumber);
    const played = matches.length;
    const won = matches.filter((match) => match.won).length;
    const lost = matches.filter((match) => !match.won && !match.tied && !match.noResult).length;
    const tied = matches.filter((match) => match.tied).length;
    const noResult = matches.filter((match) => match.noResult).length;
    const points = won * 2 + tied + noResult;
    const counted = matches.filter((match) => !match.noResult);
    const runsFor = counted.reduce((sum, match) => sum + match.runsFor, 0);
    const ballsFaced = counted.reduce((sum, match) => sum + match.ballsFaced, 0);
    const runsAgainst = counted.reduce((sum, match) => sum + match.runsAgainst, 0);
    const ballsBowled = counted.reduce((sum, match) => sum + match.ballsBowled, 0);
    const nrr =
      (ballsFaced > 0 ? (runsFor / ballsFaced) * 6 : 0) -
      (ballsBowled > 0 ? (runsAgainst / ballsBowled) * 6 : 0);
    const form = matches
      .slice(-5)
      .map((match) => (match.noResult ? "N" : match.tied ? "T" : match.won ? "W" : "L") as "W" | "L" | "T" | "N");
    return {
      position: 0,
      teamId: team.id,
      teamName: team.name,
      teamShort: team.shortName,
      primary: team.primary,
      played,
      won,
      lost,
      tied,
      noResult,
      points,
      runsFor,
      ballsFaced,
      runsAgainst,
      ballsBowled,
      nrr,
      form,
      qualification: "none" as StandingRow["qualification"],
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (Math.abs(b.nrr - a.nrr) > 0.0001) return b.nrr - a.nrr;
    if (b.won !== a.won) return b.won - a.won;
    return a.teamName.localeCompare(b.teamName);
  });
  return rows.map((row, index) => ({
    ...row,
    position: index + 1,
    qualification: leagueComplete
      ? index === 0 || index === 1
        ? "q1"
        : index === 2 || index === 3
          ? "eliminator"
          : "none"
      : "none",
  }));
}

export function seedPlayoffs(standings: StandingRow[]): {
  q1Home: string;
  q1Away: string;
  eliminatorHome: string;
  eliminatorAway: string;
} | null {
  if (standings.length < 4) return null;
  return {
    q1Home: standings[0].teamId,
    q1Away: standings[1].teamId,
    eliminatorHome: standings[2].teamId,
    eliminatorAway: standings[3].teamId,
  };
}
