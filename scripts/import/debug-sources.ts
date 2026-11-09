import path from "node:path";
import { parseOpenIpl } from "./openipl";
import { parseAuctionCsv } from "./auction";

const openipl = parseOpenIpl(path.join(process.cwd(), "data/sources/openipl-2026"), 2026);
console.log("openipl stats", openipl.stats);
console.log("warnings", openipl.warnings.slice(0, 20), "total", openipl.warnings.length);
console.log("points", openipl.pointsTable);
console.log("roles", [...new Set(openipl.players.map((p) => p.role))]);
console.log("sample players", openipl.players.slice(0, 8));
console.log("stages", [...new Set(openipl.matches.map((m) => m.stage))]);
console.log("dls", openipl.matches.filter((m) => m.dlsRevisedTarget !== null));

const auction = parseAuctionCsv(path.join(process.cwd(), "data/sources/auction/IPL_Auction_2026_Sold_Player.csv"));
console.log("auction stats", auction.stats);
console.log("auction warnings", auction.warnings, "total", auction.warnings.length);
console.log("auction sample", auction.players.slice(0, 5));
console.log("auction tail", auction.players.slice(-3));
