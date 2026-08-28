// Run the web-monitoring checks from the command line (for cron):
//   npm run monitor            — checks sources whose interval has elapsed
//   FORCE=1 npm run monitor    — checks every active source now
//
// Schedule daily, e.g.:  0 7 * * *  cd /path/to/college-os && npm run monitor

import { runDueChecks } from "../src/lib/monitor";

async function main() {
  const results = await runDueChecks(process.env.FORCE === "1");
  if (!results.length) {
    console.log("No sources due for a check.");
    return;
  }
  for (const r of results) {
    console.log(`[${r.status}] ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  const changed = results.filter((r) => r.status === "CHANGED").length;
  console.log(
    `${results.length} checked, ${changed} changed. Changes surface as alerts on the dashboard.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
