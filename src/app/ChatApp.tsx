"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { askUnified, listDocuments, listDatasets, type Message } from "@/lib/api";

export default function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [docCount, setDocCount] = useState<number | null>(null);

  useEffect(() => {
    // The knowledge base is PDFs (documents) + CSVs (datasets); count both so
    // CSV-only users aren't wrongly told they have nothing.
    Promise.all([listDocuments(), listDatasets()])
      .then(([docs, datasets]) => setDocCount(docs.length + datasets.length))
      .catch(() => setDocCount(null));
  }, []);

  async function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const { answer, sources, sql, usedDatasets } = await askUnified(
        question,
        history
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer, sources, sql, usedDatasets },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "request failed"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-neutral-500 text-sm space-y-2">
            <p>Ask a question about your documents to get started.</p>
            {docCount === 0 && (
              <p>
                You have no documents yet.{" "}
                <Link href="/documents" className="text-emerald-400 hover:underline">
                  Upload a PDF or CSV
                </Link>{" "}
                to begin.
              </p>
            )}
            {docCount !== null && docCount > 0 && (
              <p className="text-neutral-600">
                {docCount} document{docCount === 1 ? "" : "s"} available ·{" "}
                <Link href="/documents" className="text-neutral-400 hover:underline">
                  manage
                </Link>
              </p>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              {m.role === "user" ? "You" : "AskDocs"}
            </div>
            <div
              className={
                m.role === "user"
                  ? "inline-block rounded-lg bg-neutral-800 px-4 py-2"
                  : "rounded-lg border border-neutral-800 px-4 py-3"
              }
            >
              {m.content}
            </div>

            {m.sources && m.sources.length > 0 && (
              <details className="text-sm text-neutral-400">
                <summary className="cursor-pointer text-emerald-400">
                  {m.sources.length} source passages
                </summary>
                <div className="mt-2 space-y-2">
                  {m.sources.map((s, j) => (
                    <div
                      key={j}
                      className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 whitespace-pre-wrap text-xs"
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {m.sql && m.sql.length > 0 && (
              // TODO: these show raw dataset_ids. Small backend change —
              // include source/filename in the /ask response (sql[] +
              // used_datasets) — would let this panel show friendly filenames.
              <details className="text-sm text-neutral-400">
                <summary className="cursor-pointer text-emerald-400">
                  queried data:{" "}
                  {(m.usedDatasets && m.usedDatasets.length > 0
                    ? m.usedDatasets
                    : m.sql.map((s) => s.dataset_id)
                  ).join(", ")}
                </summary>
                <div className="mt-2 space-y-3">
                  {m.sql.map((s, j) => (
                    <div key={j} className="space-y-1">
                      <div className="text-xs text-neutral-500">
                        {s.dataset_id}
                      </div>
                      <pre className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 overflow-x-auto whitespace-pre-wrap text-xs">
                        {s.sql}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}

        {loading && <div className="text-sm text-neutral-500">Thinking…</div>}
      </main>

      <footer className="px-6 py-4 border-t border-neutral-800">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about your documents…"
            className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 outline-none focus:border-neutral-600"
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50 hover:bg-emerald-500"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}