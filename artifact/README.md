# College OS — the live page

`college-os.html` is a self-contained build of College OS that runs as a
published Artifact on claude.ai: one URL, opens on a phone, and keeps its data
by publishing new versions of *itself* (the `artifact` runtime capability). It
exists because the Next.js app in this repo needs a server, and a schedule you
cannot open on your phone is not a schedule you will use.

It is a genuine subset — Now / Week / Work / Campus / Classes — not the whole
six-phase system. What it carries across is the part that has to be right:

* **The YES schedule parser**, transpiled verbatim from
  `src/lib/parsers/schedule.ts` (27 tests there). Paste your class schedule and
  it reads courses, days, times, rooms, instructors and credit hours out of the
  layouts YES produces. Nothing logs into YES.
* **The priority engine**, ported from `src/lib/engine/priority.ts` — urgency
  plus the *required daily pace*, so an 8-hour project due in 3 days outranks a
  15-minute reading due tomorrow, with the reason shown on every row. An
  application deadline scores as unrecoverable, because it is.
* **The derived alert tiers**, recomputed on every render, never stored.
* **The researched campus catalog** — 28 Vanderbilt clubs, 8 Wond'ry programs
  and 20 research labs from `scripts/data/`, each with its source URL and an
  honest confidence label, with real application deadlines that rank against
  coursework once tracked.

## Editing it

Edit `college-os.src.html` — it carries `/*__PARSER__*/` and `/*__CATALOG__*/`
markers — then rebuild, so neither the parser nor the researched data is ever
hand-copied out of sync with its source:

    node artifact/build.mjs

`college-os.html` is built with an **empty** state: it is the app, not anyone's
data. To carry a real saved state forward — merging your changes onto a version
someone saved from inside the published page — pass it in:

    STATE=/path/to/state.json node artifact/build.mjs

That writes `college-os.personal.html`, which is for republishing only and is
never committed: it holds a real class schedule. The build also migrates such a
state, clearing an instructor field that an older parser filled with enrollment
prose rather than preserving the mistake.

One trap worth knowing: the build substitutes with replacer **functions**, not
string replacements. The parser source contains a regex ending in `$` followed
by a backtick, and `String.replace` reads that as a substitution pattern and
silently corrupts the output — the page then fails to parse with "Unexpected end
of input".

## Testing it

`e2e.mjs` drives the built page in Chromium: the paste-and-review flow, the
ranking claim, the Campus catalog and deadline tracking, both themes, the
read-only and no-viewer cases, mobile overflow, and — the one that matters most
— the **publish round trip**, where the page's own generated replacement is
loaded back and must render the same state. Saving is stubbed, so the suite
never publishes anything.

    CHROMIUM_PATH=/path/to/chrome node artifact/e2e.mjs

## Known gap

A real YES paste produced ten courses with correct codes and titles and **zero
meeting times** — the layout it came from is not one the parser handles yet.
Until a sample of that text is available to fix the parser against, the Classes
tab has a per-course meeting editor, and any course without times is flagged on
both Classes and Week rather than quietly vanishing from the schedule.

## Two things it does not do

It has no server, so there is no AI chat, no web monitoring, and no career or
startup tracker — those live in the Next.js app. And its data lives in the page
itself: everyone who can open the link can read it, and anyone who can write it
can change it. Keep it to your own schedule and coursework.
