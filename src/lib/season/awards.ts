import type { SeasonAward } from "./types";

export type AwardStatLine = {
  playerId: string;
  name: string;
  teamId: string;
  teamShort: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  ballsBowled: number;
  runsConceded: number;
  dots: number;
  catches: number;
  stumpings: number;
  runOuts: number;
};

export type FranchiseAwardInput = {
  teamId: string;
  teamName: string;
  teamShort: string;
  label: string;
} | null;

function mvpScore(line: AwardStatLine): number {
  return (
    line.runs +
    line.fours +
    line.sixes * 2 +
    line.wickets * 25 -
    line.runsConceded * 0.3 +
    line.dots * 0.5 +
    line.catches * 6 +
    line.stumpings * 6 +
    line.runOuts * 8
  );
}

function strikeRate(line: AwardStatLine): number {
  return line.balls > 0 ? (line.runs / line.balls) * 100 : 0;
}

function economy(line: AwardStatLine): number {
  return line.ballsBowled > 0 ? (line.runsConceded / line.ballsBowled) * 6 : 0;
}

export function computeAwards(
  lines: AwardStatLine[],
  franchise: FranchiseAwardInput,
  minBallsBatting = 120,
  minBallsBowling = 120,
): SeasonAward[] {
  const awards: SeasonAward[] = [];
  const withRuns = lines.filter((line) => line.runs > 0);
  const withWickets = lines.filter((line) => line.wickets > 0);
  const withBattingSample = lines.filter((line) => line.balls >= minBallsBatting);
  const withBowlingSample = lines.filter((line) => line.ballsBowled >= minBallsBowling);

  const mvp = [...lines].sort((a, b) => mvpScore(b) - mvpScore(a) || b.runs - a.runs)[0];
  if (mvp) {
    awards.push({
      id: "mvp",
      label: "Most valuable player",
      playerId: mvp.playerId,
      playerName: mvp.name,
      teamId: mvp.teamId,
      teamShort: mvp.teamShort,
      value: `${Math.round(mvpScore(mvp))} pts`,
      detail: `${mvp.runs} runs · ${mvp.wickets} wickets · ${mvp.catches + mvp.stumpings + mvp.runOuts} fielding dismissals`,
    });
  }

  const topRuns = [...withRuns].sort((a, b) => b.runs - a.runs || strikeRate(b) - strikeRate(a))[0];
  if (topRuns) {
    awards.push({
      id: "runs",
      label: "Leading run scorer",
      playerId: topRuns.playerId,
      playerName: topRuns.name,
      teamId: topRuns.teamId,
      teamShort: topRuns.teamShort,
      value: `${topRuns.runs} runs`,
      detail: `${topRuns.balls} balls · ${strikeRate(topRuns).toFixed(1)} strike rate · ${topRuns.sixes} sixes`,
    });
  }

  const topWickets = [...withWickets].sort((a, b) => b.wickets - a.wickets || economy(a) - economy(b))[0];
  if (topWickets) {
    awards.push({
      id: "wickets",
      label: "Leading wicket taker",
      playerId: topWickets.playerId,
      playerName: topWickets.name,
      teamId: topWickets.teamId,
      teamShort: topWickets.teamShort,
      value: `${topWickets.wickets} wickets`,
      detail: `${economy(topWickets).toFixed(2)} economy · ${topWickets.dots} dot balls`,
    });
  }

  const topStrikeRate = [...withBattingSample].sort((a, b) => strikeRate(b) - strikeRate(a))[0];
  if (topStrikeRate) {
    awards.push({
      id: "strike-rate",
      label: "Best strike rate",
      playerId: topStrikeRate.playerId,
      playerName: topStrikeRate.name,
      teamId: topStrikeRate.teamId,
      teamShort: topStrikeRate.teamShort,
      value: strikeRate(topStrikeRate).toFixed(1),
      detail: `${topStrikeRate.runs} runs from ${topStrikeRate.balls} balls (min. ${minBallsBatting} balls)`,
    });
  }

  const topEconomy = [...withBowlingSample].sort((a, b) => economy(a) - economy(b))[0];
  if (topEconomy) {
    awards.push({
      id: "economy",
      label: "Best economy",
      playerId: topEconomy.playerId,
      playerName: topEconomy.name,
      teamId: topEconomy.teamId,
      teamShort: topEconomy.teamShort,
      value: economy(topEconomy).toFixed(2),
      detail: `${topEconomy.wickets} wickets from ${topEconomy.ballsBowled} balls (min. ${minBallsBowling} balls)`,
    });
  }

  const topSixes = [...withRuns].sort((a, b) => b.sixes - a.sixes || b.runs - a.runs)[0];
  if (topSixes && topSixes.sixes > 0) {
    awards.push({
      id: "sixes",
      label: "Most sixes",
      playerId: topSixes.playerId,
      playerName: topSixes.name,
      teamId: topSixes.teamId,
      teamShort: topSixes.teamShort,
      value: `${topSixes.sixes}`,
      detail: `${topSixes.runs} runs · strike rate ${strikeRate(topSixes).toFixed(1)}`,
    });
  }

  const fielder = [...lines].sort(
    (a, b) =>
      b.catches + b.stumpings + b.runOuts - (a.catches + a.stumpings + a.runOuts) ||
      b.catches - a.catches,
  )[0];
  if (fielder && fielder.catches + fielder.stumpings + fielder.runOuts > 0) {
    awards.push({
      id: "fielding",
      label: "Best fielder",
      playerId: fielder.playerId,
      playerName: fielder.name,
      teamId: fielder.teamId,
      teamShort: fielder.teamShort,
      value: `${fielder.catches + fielder.stumpings + fielder.runOuts} dismissals`,
      detail: `${fielder.catches} catches · ${fielder.stumpings} stumpings · ${fielder.runOuts} run-outs`,
    });
  }

  if (franchise) {
    awards.push({
      id: "franchise",
      label: "Franchise of the season",
      playerId: null,
      playerName: franchise.teamName,
      teamId: franchise.teamId,
      teamShort: franchise.teamShort,
      value: franchise.label,
      detail: "Awarded from the simulated final table and playoff results.",
    });
  }

  return awards;
}
