import { NextResponse } from "next/server";
import { AuctionError } from "@/lib/auction/service";
import { loadVoiceClip } from "@/lib/auction/lobby";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; clipId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id, clipId } = await context.params;
  try {
    const clip = loadVoiceClip(id, clipId);
    if (!clip) {
      return NextResponse.json({ error: "That voice note is unavailable.", code: "CLIP_NOT_FOUND" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(clip.data), {
      status: 200,
      headers: {
        "Content-Type": clip.mime,
        "Content-Length": String(clip.data.byteLength),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    if (error instanceof AuctionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Voice clip error", error);
    return NextResponse.json({ error: "The voice note could not be loaded.", code: "INTERNAL" }, { status: 500 });
  }
}
