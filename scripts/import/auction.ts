import fs from "node:fs";
import { parseCsvObjects } from "./csv";
import { parseIndianPriceToLakh } from "@/lib/money";
import { getFranchise, teamIdFromName } from "@/lib/teams";

export type AuctionSoldPlayer = {
  rowNumber: number;
  name: string;
  nationalityLabel: string;
  isOverseas: boolean;
  basePriceLakh: number;
  winningBidLakh: number;
  teamId: string;
  teamName: string;
  cappedLabel: string;
  capped: boolean | null;
};

export type AuctionData = {
  players: AuctionSoldPlayer[];
  warnings: string[];
  stats: {
    rows: number;
    teams: number;
    totalSpendLakh: number;
    highestBidLakh: number;
    uncappedCount: number;
    overseasCount: number;
  };
};

export function parseAuctionCsv(csvPath: string): AuctionData {
  const rows = parseCsvObjects(fs.readFileSync(csvPath, "utf8"));
  const warnings: string[] = [];
  const players: AuctionSoldPlayer[] = [];
  const names = new Set<string>();
  let rowNumber = 0;

  for (const row of rows) {
    rowNumber += 1;
    const name = row.Name?.replace(/\s+/g, " ").trim();
    if (!name) {
      warnings.push(`Auction row ${rowNumber} has no player name`);
      continue;
    }
    if (names.has(name.toLowerCase())) {
      warnings.push(`Duplicate auction player name: ${name}`);
    }
    names.add(name.toLowerCase());
    const teamName = row.TeamName?.trim() ?? "";
    const teamId = teamIdFromName(teamName);
    if (!getFranchise(teamId)) {
      warnings.push(`Unknown auction team "${teamName}" for ${name}`);
      continue;
    }
    let basePriceLakh = 0;
    let winningBidLakh = 0;
    try {
      basePriceLakh = parseIndianPriceToLakh(row["BasePrices in Rs"] ?? "");
      winningBidLakh = parseIndianPriceToLakh(row["Winning Bid in Rs"] ?? "");
    } catch (error) {
      warnings.push(`Invalid price for ${name}: ${(error as Error).message}`);
      continue;
    }
    if (basePriceLakh <= 0) warnings.push(`${name} has a non-positive base price`);
    if (winningBidLakh < basePriceLakh) {
      warnings.push(`${name} winning bid (${winningBidLakh}) is below base price (${basePriceLakh})`);
    }
    const nationalityLabel = row.Nationality?.trim() ?? "";
    let isOverseas: boolean;
    if (nationalityLabel.toLowerCase() === "indian") isOverseas = false;
    else if (nationalityLabel.toLowerCase() === "overseas") isOverseas = true;
    else {
      warnings.push(`Unrecognised nationality label "${nationalityLabel}" for ${name}`);
      isOverseas = true;
    }
    const cappedLabel = row["Capped/UnCapped"]?.trim() ?? "";
    const capped =
      cappedLabel.toLowerCase() === "capped"
        ? true
        : cappedLabel.toLowerCase() === "uncapped"
          ? false
          : null;
    if (capped === null) warnings.push(`Unrecognised capped label "${cappedLabel}" for ${name}`);
    players.push({
      rowNumber,
      name,
      nationalityLabel,
      isOverseas,
      basePriceLakh,
      winningBidLakh,
      teamId,
      teamName,
      cappedLabel,
      capped,
    });
  }

  const teams = new Set(players.map((player) => player.teamId));
  const totalSpendLakh = players.reduce((sum, player) => sum + player.winningBidLakh, 0);
  const highestBidLakh = players.reduce((max, player) => Math.max(max, player.winningBidLakh), 0);
  return {
    players,
    warnings,
    stats: {
      rows: players.length,
      teams: teams.size,
      totalSpendLakh,
      highestBidLakh,
      uncappedCount: players.filter((player) => player.capped === false).length,
      overseasCount: players.filter((player) => player.isOverseas).length,
    },
  };
}
