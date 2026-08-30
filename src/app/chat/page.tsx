// ASK COLLEGE OS — chat over the student's real data. The server shell only
// reports whether Claude is wired up; the conversation lives in the client
// component and POSTs to /api/chat.

import Chat from "@/components/Chat";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  const aiOn = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div>
      <PageHeader
        title="Ask College OS"
        subtitle="A chief of staff that answers only from your real courses, deadlines, plans, and goals."
      />

      <div className="max-w-3xl">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3.5 py-2.5">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: aiOn ? "var(--status-good)" : "var(--status-warning)",
            }}
            aria-hidden
          />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {aiOn
              ? "Claude-powered answers"
              : "Heuristic answers (set ANTHROPIC_API_KEY for full AI)"}
          </span>
        </div>

        <Chat />
      </div>
    </div>
  );
}
