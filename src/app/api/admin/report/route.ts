import { NextResponse } from "next/server";
import { getQualityReport } from "@/lib/data/quality";
import { isAdminAuthenticated } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const report = getQualityReport();
  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ipl-arena-data-quality.json"',
      "Cache-Control": "no-store",
    },
  });
}
