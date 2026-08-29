# College OS — the live page

`college-os.html` is a self-contained build of College OS that runs as a
published Artifact on claude.ai: one URL, opens on a phone, and keeps its data
by publishing new versions of *itself* (the `artifact` runtime capability). It
exists because the Next.js app in this repo needs a server, and a schedule you
cannot open on your phone is not a schedule you will use.

It is a genuine subset — Now / Week / Work / Classes — not the whole six-phase
system. What it carries across is the part that has to be right:

* **The YES schedule parser**, transpiled verbatim from
  `src/lib/parsers/schedule.ts` (23 tests there). Paste your class schedule and
  it reads courses, days, times, rooms, instructors and credit hours out of any
  of the three layouts YES produces. Nothing logs into YES.
* **The priority engine**, ported from `src/lib/engine/priority.ts` — urgency
  plus the *required daily pace*, so an 8-hour project due in 3 days outranks a
  15-minute reading due tomorrow, with the reason shown on every row.
* **The derived alert tiers**, recomputed on every render, never stored.

## Editing it

Edit `college-os.src.html` — it carries a `/*__PARSER__*/` marker — then rebuild
so the parser is never hand-copied out of sync with the tested original:

```bash
npx tsc src/lib/parsers/schedule.ts --outDir /tmp/port --target es2022 \
  --module esnext --skipLibCheck
python3 - <<'PY'
import io, re
parser = re.sub(r'^export\s+', '', io.open('/tmp/port/schedule.js').read(), flags=re.M)
src = io.open('artifact/college-os.src.html').read()
io.open('artifact/college-os.html', 'w').write(src.replace('/*__PARSER__*/', parser.strip()))
PY
```

## Testing it

`e2e.mjs` drives the built page in Chromium: the paste-and-review flow, the
ranking claim, both themes, the read-only and no-viewer cases, and — the one
that matters most — the **publish round trip**, where the page's own generated
replacement is loaded and must render the same state back. Saving is stubbed,
so the suite never publishes anything.

```bash
CHROMIUM_PATH=/path/to/chrome node artifact/e2e.mjs
```

## Two things it does not do

It has no server, so there is no AI chat, no web monitoring, and no club, lab,
career or startup data — those live in the Next.js app. And its data lives in
the page itself: everyone who can open the link can read it, and anyone who can
write it can change it. Keep it to your own schedule and coursework.
