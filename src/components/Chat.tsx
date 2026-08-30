"use client";

// The "Ask College OS" chat surface. Sends questions (with prior turns as
// history) to /api/chat; the server decides Claude vs. heuristic.

import { useEffect, useRef, useState } from "react";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "What should I do today?",
  "What should I study tonight?",
  "What do I need to prepare before my next class?",
  "Am I falling behind?",
  "Do I have any deadlines next week?",
  "What should I do if I only have 2 hours tonight?",
];

export default function Chat() {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    const history = messages; // prior turns only
    setError(null);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as { answer?: string };
      if (!data.answer) throw new Error("Empty answer");
      setMessages((m) => [...m, { role: "assistant", content: data.answer as string }]);
    } catch {
      setError("Couldn't get an answer — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex h-[calc(100vh-16rem)] min-h-[420px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-sm">
      <div className="thin-scroll flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && !loading ? (
          <div className="pt-1">
            <p className="text-sm text-[var(--text-secondary)]">
              Ask anything about your semester — answers come only from your own
              courses, deadlines, plans, and goals.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--gold)] hover:text-[var(--text-primary)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div
                key={i}
                className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm border border-[#cfae70]/50 bg-[#cfae70]/20 px-3.5 py-2.5 text-sm"
              >
                {m.content}
              </div>
            ) : (
              <div
                key={i}
                className="mr-auto max-w-[85%] whitespace-pre-wrap rounded-xl rounded-bl-sm border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm leading-relaxed"
              >
                {m.content}
              </div>
            ),
          )
        )}

        {loading && (
          <div
            className="mr-auto flex w-fit items-center gap-1 rounded-xl rounded-bl-sm border border-[var(--border)] bg-white px-3.5 py-3"
            aria-label="Thinking"
          >
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-muted)]"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="mr-auto max-w-[85%] rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Ask about your week — e.g. "What is due Friday?"'
          aria-label="Your question"
          className="flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--gold)]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-[var(--black)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}
