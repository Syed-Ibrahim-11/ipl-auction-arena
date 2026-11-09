import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/db";
import { CURRENT_PLAYER_SQL } from "@/lib/data/queries";

export const runtime = "nodejs";
export const alt = "IPL Auction Arena — every bid, every strategy, every player";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadFont(file: string): Promise<ArrayBuffer | null> {
  try {
    const data = await readFile(path.join(process.cwd(), "public", "fonts", file));
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

function activePlayerCount(): number {
  try {
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS n FROM players p WHERE ${CURRENT_PLAYER_SQL}`)
      .get() as { n: number } | undefined;
    return row?.n ?? 263;
  } catch {
    return 263;
  }
}

export default async function OpengraphImage() {
  const players = activePlayerCount();
  const [barlow, inter] = await Promise.all([
    loadFont("BarlowCondensed-700.ttf"),
    loadFont("Inter-600.ttf"),
  ]);
  const fonts = [
    ...(barlow ? [{ name: "Barlow", data: barlow, weight: 700 as const, style: "normal" as const }] : []),
    ...(inter ? [{ name: "Inter", data: inter, weight: 600 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#070b12",
          color: "#edf2f9",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background:
              "radial-gradient(circle at 6% 0%, rgba(255,122,26,0.24), transparent 46%), radial-gradient(circle at 100% 100%, rgba(90,167,255,0.14), transparent 50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(rgba(237,242,249,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(237,242,249,0.045) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: "54px 64px 46px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 16,
                  background: "linear-gradient(135deg, #ff7a1a, #ffb15c)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Barlow, sans-serif",
                  fontSize: 36,
                  fontWeight: 700,
                  color: "#070b12",
                }}
              >
                A
              </div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                <span style={{ fontSize: 15, letterSpacing: 6, color: "#ffb15c", textTransform: "uppercase" }}>
                  IPL Auction
                </span>
                <span style={{ fontFamily: "Barlow, sans-serif", fontSize: 32, fontWeight: 700, letterSpacing: 2 }}>
                  ARENA
                </span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid rgba(255,177,92,0.4)",
                borderRadius: 999,
                padding: "9px 18px",
                fontSize: 14,
                letterSpacing: 2,
                color: "#ffb15c",
                textTransform: "uppercase",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 999, background: "#ff7a1a" }} />
              Independent simulator · 2026
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 44 }}>
            <div style={{ display: "flex", flexDirection: "column", width: 680 }}>
              <span style={{ fontSize: 15, letterSpacing: 5, color: "#8b98ad", textTransform: "uppercase" }}>
                Every bid · every strategy · every player
              </span>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 18,
                  fontFamily: "Barlow, sans-serif",
                  fontSize: 104,
                  fontWeight: 700,
                  lineHeight: 0.84,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                <span>Build your</span>
                <span style={{ color: "#ff7a1a" }}>ultimate squad</span>
              </div>
              <p style={{ marginTop: 22, marginBottom: 0, fontSize: 21, lineHeight: 1.45, color: "#b9c3d3", maxWidth: 620 }}>
                Real ball-by-ball evidence. Explainable ratings. A live auction room with ten AI
                franchises and a purse that punishes sentiment.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: 340,
                border: "1px solid rgba(255,122,26,0.45)",
                borderRadius: 22,
                background: "rgba(13,21,34,0.92)",
                padding: 22,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, letterSpacing: 3, color: "#8b98ad", textTransform: "uppercase" }}>
                  Auction board
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    borderRadius: 999,
                    background: "rgba(255,122,26,0.14)",
                    border: "1px solid rgba(255,122,26,0.35)",
                    padding: "5px 10px",
                    fontSize: 11,
                    letterSpacing: 1,
                    color: "#ffb15c",
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: "#ff7a1a" }} />
                  LIVE LOT
                </span>
              </div>
              <div style={{ marginTop: 18, fontSize: 12, letterSpacing: 2, color: "#8b98ad" }}>
                LOT 017 · SET 4
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontFamily: "Barlow, sans-serif",
                  fontSize: 36,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Overseas all-rounder
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 20,
                  borderTop: "1px solid rgba(237,242,249,0.12)",
                  paddingTop: 16,
                }}
              >
                <span style={{ fontSize: 11, letterSpacing: 3, color: "#8b98ad", textTransform: "uppercase" }}>
                  Current bid
                </span>
                <span
                  style={{
                    fontFamily: "Barlow, sans-serif",
                    fontSize: 56,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: "#ff7a1a",
                  }}
                >
                  ₹14.40 Cr
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13 }}>
                <span style={{ color: "#8b98ad" }}>Leader</span>
                <span style={{ color: "#edf2f9" }}>Franchise B</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 13 }}>
                <span style={{ color: "#8b98ad" }}>Purse left</span>
                <span style={{ color: "#edf2f9" }}>₹31.20 Cr</span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(237,242,249,0.12)",
              paddingTop: 20,
              fontSize: 14,
              color: "#8b98ad",
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            <span>{`1,243 matches · 295,557 deliveries · ${players} players`}</span>
            <span>Not affiliated with BCCI or IPL</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );
}
