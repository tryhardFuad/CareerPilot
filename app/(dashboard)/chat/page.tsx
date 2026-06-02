import { Send, Sparkles, Bot } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-2xl border border-secondary-100 bg-white shadow-card">
      <header className="flex items-center gap-2 border-b border-secondary-100 px-5 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white">
          <Bot className="h-4 w-4" />
        </span>
        <div>
          <p className="font-heading text-sm font-semibold">CareerPilot Assistant</p>
          <p className="text-xs text-secondary-500">
            RAG-grounded in your CV, with live web search.
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex max-w-2xl gap-3">
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-primary text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="rounded-2xl rounded-tl-sm bg-secondary-50 px-4 py-3 text-sm text-secondary-700">
            Ask me anything about your job search — I&apos;ll cite the CV chunks
            I use to answer.
          </div>
        </div>
      </div>

      <form className="flex items-center gap-2 border-t border-secondary-100 p-3">
        <input
          type="text"
          placeholder="e.g. Which roles fit my Next.js + Supabase experience?"
          className="flex-1 rounded-lg border border-secondary-100 bg-secondary-50/40 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white"
        />
        <button
          type="submit"
          className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white transition hover:bg-primary-600"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
