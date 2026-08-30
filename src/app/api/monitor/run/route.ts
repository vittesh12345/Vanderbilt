import { NextRequest, NextResponse } from "next/server";
import { runDueChecks } from "@/lib/monitor";

// POST /api/monitor/run — check monitored sources now. {force: true} checks
// every active source regardless of its interval. In production this is also
// what a cron job hits daily.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const results = await runDueChecks(body.force === true);
  return NextResponse.json({
    checked: results.length,
    changed: results.filter((r) => r.status === "CHANGED").length,
    errors: results.filter((r) => r.status === "ERROR").length,
    results,
  });
}
