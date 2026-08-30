// Builds the College OS live page. Two outputs, deliberately:
//   college-os.html          — empty state; this is what the repo ships and
//                              what the e2e suite runs against.
//   college-os.personal.html — the same app carrying a real saved state, for
//                              republishing to a personal artifact only.
//                              Never committed: it holds someone's schedule.
import fs from "fs";
import { execSync } from "child_process";

const S = process.env.OUT_DIR || "/tmp/claude-0/-home-user/e6c97d17-df35-5648-899d-4f8bd09a5be1/scratchpad";
const ROOT = process.env.REPO || "/home/user/Vanderbilt";

execSync(`npx tsc ${ROOT}/src/lib/parsers/schedule.ts --outDir ${S}/port --target es2022 --module esnext --skipLibCheck`, { stdio: "inherit" });
const parser = fs.readFileSync(`${S}/port/schedule.js`, "utf8").replace(/^export\s+/gm, "").trim();
const catalog = fs.readFileSync(`${S}/catalog.json`, "utf8");
const src = fs.readFileSync(`${ROOT}/artifact/college-os.src.html`, "utf8");

if (src.includes("</script") === false) throw new Error("source lost its script tags");
// Replacer FUNCTIONS, never string replacements: the parser source contains
// `$\`` (a regex ending in $ followed by a backtick) and String.replace would
// treat that as a substitution pattern and silently corrupt the output.
const base = src
  .replace("/*__PARSER__*/", () => parser)
  .replace("/*__CATALOG__*/", () => catalog);
if (base.includes("__PARSER__") || base.includes("__CATALOG__")) throw new Error("placeholder left unfilled");

fs.writeFileSync(`${ROOT}/artifact/college-os.html`, base);
console.log("built empty:", base.length, "bytes");

const statePath = process.env.STATE;
if (statePath) {
  const st = JSON.parse(fs.readFileSync(statePath, "utf8"));

  // Migration: a state saved before the instructor guard landed can carry
  // enrollment prose in `professor` ("and DUS after first day of class,
  // 8/26/2026"). Apply the same rule the parser now uses, so carrying a state
  // forward repairs it instead of preserving the mistake.
  let repaired = 0;
  for (const c of st.courses || []) {
    const v = c.professor;
    if (typeof v === "string" && (/\d/.test(v) ||
        /^(?:and|or|of|the|for|with|consent|permission)\b/i.test(v) ||
        v.split(/\s+/).length > 6)) {
      c.professor = null;
      repaired++;
    }
    if (!Array.isArray(c.meetings)) c.meetings = [];
  }
  if (!Array.isArray(st.dismissed)) st.dismissed = [];
  if (repaired) console.log("repaired", repaired, "mis-parsed instructor field(s)");

  const json = JSON.stringify(st).replace(/</g, "\\u003c");
  const personal = base.replace(
    /(<script id="app-state" type="application\/json">)[\s\S]*?(<\/script>)/,
    (_, a, b) => a + json + b,
  );
  if (personal === base) throw new Error("state was not substituted");
  fs.writeFileSync(`${S}/college-os.personal.html`, personal);
  console.log("built personal:", personal.length, "bytes,",
    st.courses.length, "courses,", st.items.length, "items");
}
