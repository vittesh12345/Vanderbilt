// POST /api/chat — answer a question about the student's own data.
// Claude when ANTHROPIC_API_KEY is set; the deterministic heuristic otherwise
// (and as the fallback when the API call fails).

import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { aiAvailable, answerWithAI, type ChatTurn } from "@/lib/ai/claude";
import { heuristicAnswer, type ChatContextPack } from "@/lib/ai/fallback";
import { getChatContextPack, getEventsInRange } from "@/lib/data/queries";

const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY_TURNS = 10;

function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is ChatTurn =>
        typeof t === "object" &&
        t !== null &&
        ((t as { role?: unknown }).role === "user" ||
          (t as { role?: unknown }).role === "assistant") &&
        typeof (t as { content?: unknown }).content === "string",
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    question?: unknown;
    history?: unknown;
  } | null;

  const question =
    typeof body?.question === "string" ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  const history = parseHistory(body?.history);

  const now = new Date();
  const [base, events] = await Promise.all([
    getChatContextPack(now),
    getEventsInRange(now, addDays(now, 30)),
  ]);
  const pack: ChatContextPack = {
    ...base,
    upcomingEvents: events.map((e) => ({
      title: e.title,
      category: e.category,
      startAt: e.startAt,
      location: e.location,
    })),
  };

  if (aiAvailable()) {
    try {
      const answer = await answerWithAI(question, pack, history);
      return NextResponse.json({ answer, aiUsed: true });
    } catch {
      // Best-effort: the heuristic answer stands on its own.
      const answer = `(AI was temporarily unavailable — this is the built-in heuristic answer.)\n\n${heuristicAnswer(question, pack)}`;
      return NextResponse.json({ answer, aiUsed: false });
    }
  }

  return NextResponse.json({ answer: heuristicAnswer(question, pack), aiUsed: false });
}
