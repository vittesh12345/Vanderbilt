import { chromium } from "playwright";
import fs from "fs";
const S = process.env.OUT_DIR || "/tmp/college-os-e2e";
fs.mkdirSync(S, { recursive: true });
const SRC_FILE = process.env.SRC_FILE || new URL("./college-os.html", import.meta.url).pathname;

// Mirror how the platform wraps an authored artifact file.
function wrap(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#fbfbfa}
img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;
}

const fails = [];
const netNoise = e => /fonts\.googleapis|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|Failed to load resource/.test(e);
const ok = (c, m) => { if (!c) { fails.push(m); console.log("  FAIL: " + m); } else console.log("  ok: " + m); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function open(html, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push("PAGEERROR " + e.message));
  // Stub the viewer: capture publishes instead of performing them.
  await page.addInitScript(() => {
    window.__published = [];
    window.claude = { use: async (n) => n === "artifact" ? {
      publish: async (html) => { window.__published.push(html); return { version: "v" + window.__published.length }; }
    } : null };
  });
  const f = S + "/run-" + Math.random().toString(36).slice(2) + ".html";
  fs.writeFileSync(f, html);
  await page.goto("file://" + f, { waitUntil: "load" });
  await page.waitForTimeout(250);
  return { page, ctx, errors, label };
}

const SRC = fs.readFileSync(SRC_FILE, "utf8");

console.log("\n[1] first run");
let { page, ctx, errors } = await open(wrap(SRC));
ok(errors.filter(e => !netNoise(e)).length === 0, "no console/page errors: " + errors.join(" | "));
ok(await page.locator("nav.tabs").count() === 1, "exactly one tab bar");
ok((await page.locator("#root").innerText()).includes("Start with your real schedule"), "welcome shown when empty");

console.log("\n[2] paste a YES schedule → review → save");
await page.getByRole("button", { name: "Paste my schedule" }).click();
await page.waitForTimeout(120);
const PASTE = [
  "Fall 2026 | Undergraduate | Vanderbilt University",
  "Class\tDescription\tDays & Times\tRoom\tInstructor\tUnits",
  "CS 2201-02\tProgram Design and Data Structures\tMWF\t11:15AM - 12:05PM\tFeatheringill Hall 134\tA. Rivera\t3.00",
  "MATH 2300-01\tMultivariable Calculus\tTR\t9:30AM - 10:45AM\tStevenson 1206\tK. Osei\t4.00",
  "BSCI 1511L-07\tIntroduction to Biological Sciences Laboratory\tW\t2:20PM - 5:00PM\tStevenson 4309\tStaff\t1.00",
].join("\n");
await page.locator("textarea").fill(PASTE);
await page.getByRole("button", { name: "Read schedule" }).click();
await page.waitForTimeout(200);
let rev = await page.locator("#root").innerText();
ok(rev.includes("Check this before it's saved"), "review screen shown before saving");
ok(rev.includes("CS 2201") && rev.includes("MATH 2300") && rev.includes("BSCI 1511L"), "all three courses listed");
ok(rev.includes("Term read as Fall 2026"), "term detected");
ok(/read cleanly/i.test(rev), "confidence badge rendered");
ok(await page.locator(".rev").count() === 3, "three review rows");
await page.getByRole("button", { name: "Save these classes" }).click();
await page.waitForTimeout(200);
const week = await page.locator("#root").innerText();
ok(week.includes("Monday") && week.includes("CS 2201"), "week view shows the saved classes");
ok(week.includes("11:15am") && week.includes("until 12:05pm"), "meeting times rendered in 12h");
ok(week.includes("2:20pm") && week.includes("until 5:00pm"), "afternoon lab read as pm");
ok(!week.includes("2:20am") && !week.includes("5:00am"), "afternoon lab is not silently turned into a 2am class");

console.log("\n[3] add work and check ranking is not a due-date sort");
await page.locator(".tab", { hasText: "Work" }).click();
await page.waitForTimeout(120);
const today = new Date();
const d = n => new Date(today.getTime() + n * 864e5).toISOString().slice(0, 10);
async function addWork(title, courseIdx, kind, due, mins, weight) {
  await page.locator("input.in[placeholder='Problem set 4']").fill(title);
  const sels = page.locator("select.in");
  await sels.nth(0).selectOption({ index: courseIdx });
  await sels.nth(1).selectOption(kind);
  await page.locator("input[type=date]").fill(due);
  await page.locator("input[placeholder='90']").fill(String(mins));
  await page.locator("input[placeholder='5']").fill(String(weight));
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(150);
}
await addWork("Reading — chapter 4", 1, "READING", d(1), 15, 2);       // due tomorrow, tiny
await addWork("Project 2 — hash tables", 1, "PROJECT", d(3), 480, 20);  // 8h, due in 3 days
const workTxt = await page.locator("#root").innerText();
const iProj = workTxt.indexOf("Project 2"), iRead = workTxt.indexOf("Reading — chapter 4");
ok(iProj > -1 && iRead > -1 && iProj < iRead, "8h project due in 3 days outranks 15-min reading due tomorrow");
ok(workTxt.includes("CRITICAL"), "the project reads as critical");
ok(workTxt.includes("/day"), "reason explains the required daily pace");

console.log("\n[4] Now tab: alerts + ranked list");
await page.locator(".tab", { hasText: "Now" }).click();
await page.waitForTimeout(150);
const nowTxt = await page.locator("#root").innerText();
ok(nowTxt.includes("Do this next"), "ranked list present");
ok(nowTxt.includes("Today's classes"), "today's classes present");
ok(/due tomorrow/i.test(nowTxt), "deadline alert raised");

console.log("\n[5] publish round-trip — the saved page must render itself");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(400);
const published = await page.evaluate(() => window.__published || null);
ok(published !== null, "publish stub was installed");
ok(published.length === 1, "exactly one publish call");
const doc = published[0];
ok(doc.startsWith("<!doctype html>"), "published doc starts with a doctype");
ok(doc.includes('id="app-state"') && doc.includes('id="app-js"') && doc.includes('id="app-css"'), "published doc carries state, script and style");
ok(!doc.includes("__published"), "no viewer-session/test scripts leaked into the published doc");
fs.writeFileSync(S + "/published.html", doc);

const r2 = await open(doc, "round2");
ok(r2.errors.filter(e => !netNoise(e)).length === 0, "republished page loads clean: " + r2.errors.join(" | "));
const t2 = await r2.page.locator("#root").innerText();
ok(t2.includes("Do this next"), "republished page renders the app");
ok(t2.includes("Project 2"), "republished page kept the work");
const savedState = JSON.parse(doc.match(/<script id="app-state"[^>]*>([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, "<"));
ok(savedState.term === "Fall 2026", "published state kept the term, got " + JSON.stringify(savedState.term));
ok(savedState.courses.length === 3, "published state kept 3 courses, got " + savedState.courses.length);
ok(savedState.items.length === 2, "published state kept 2 work items, got " + savedState.items.length);
ok(savedState.courses.every(c => c.meetings.length > 0), "every saved course kept its meetings");
ok(/fall 2026/i.test(t2), "republished page shows the term");
await r2.page.locator(".tab", { hasText: "Week" }).click();
await r2.page.waitForTimeout(150);
const w2 = await r2.page.locator("#root").innerText();
ok(w2.includes("CS 2201") && w2.includes("BSCI 1511L"), "republished page kept the schedule");
ok(await r2.page.locator("nav.tabs").count() === 1, "still one tab bar after reload");

console.log("\n[6] dark theme + read-only viewer");
const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
const dp = await dark.newPage();
await dp.addInitScript(() => { window.claude = { use: async () => null }; });   // capability unavailable
fs.writeFileSync(S + "/dark.html", doc);
await dp.goto("file://" + S + "/dark.html", { waitUntil: "load" });
await dp.waitForTimeout(300);
const bg = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor);
const fg = await dp.evaluate(() => getComputedStyle(document.body).color);
ok(bg === "rgb(19, 17, 9)", "dark theme paints its own dark ground, got " + bg);
ok(fg === "rgb(240, 235, 221)", "dark theme light ink, got " + fg);
ok((await dp.locator("#root").innerText()).includes("Do this next"), "renders with no capability available");
await dp.locator(".tab", { hasText: "Work" }).click();
await dp.waitForTimeout(100);
await dp.getByRole("button", { name: "Start" }).first().click();
await dp.waitForTimeout(200);
const roTxt = await dp.locator("#root").innerText();
ok(/on this device/i.test(roTxt) || /device only/i.test(roTxt), "read-only view says changes stay on the device");

console.log("\n[6b] no window.claude at all (a copy opened outside a viewer)");
const bare = await browser.newContext({ viewport: { width: 390, height: 844 } });
const bp = await bare.newPage();
fs.writeFileSync(S + "/bare.html", doc);
await bp.goto("file://" + S + "/bare.html", { waitUntil: "load" });
await bp.waitForTimeout(300);
ok(/on this device/i.test(await bp.locator(".top").innerText()), "bare copy says changes are device-only, not a Save button");
ok((await bp.locator("#root").innerText()).includes("Do this next"), "bare copy still works as a reader");

console.log("\n[7] light theme explicit");
const lt = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
const lp = await lt.newPage();
await lp.addInitScript(() => { window.claude = { use: async () => null }; });
fs.writeFileSync(S + "/light.html", doc.replace('<html lang="en">', '<html lang="en" data-theme="light">'));
await lp.goto("file://" + S + "/light.html", { waitUntil: "load" });
await lp.waitForTimeout(250);
const lbg = await lp.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok(lbg === "rgb(246, 244, 239)", "explicit light beats a dark OS, got " + lbg);

console.log("\n[8] no horizontal overflow at 390px");
const ovf = await r2.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(ovf <= 0, "no sideways scroll, overflow=" + ovf);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURES` : "\nALL CHECKS PASSED");
process.exit(fails.length ? 1 : 0);
