"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  askUnified,
  askUnifiedStream,
  listDocuments,
  listDatasets,
  type Message,
} from "@/lib/api";

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

  // Merge a patch into the last message (the in-progress assistant reply). All
  // stream updates go through this so we never depend on a captured index.
  function patchLastMessage(patch: (m: Message) => Partial<Message>) {
    setMessages((prev) => {
      const next = [...prev];
      const last = next.length - 1;
      next[last] = { ...next[last], ...patch(next[last]) };
      return next;
    });
  }

  async function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;

    const history = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Push the user turn plus an empty assistant placeholder we stream into.
    // While its content is "", the bubble shows a "Thinking…" indicator.
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setLoading(true);

    let started = false; // has the first token arrived?
    try {
      await askUnifiedStream(question, history, {
        onToken: (text) => {
          started = true;
          patchLastMessage((m) => ({ content: m.content + text }));
        },
        onMetadata: ({ sources, sql, usedDatasets }) => {
          patchLastMessage(() => ({ sources, sql, usedDatasets }));
        },
        onError: (message) => {
          // Keep whatever streamed so far, but make the interruption visible.
          patchLastMessage((m) => ({
            content:
              (m.content ? m.content + "\n\n" : "") +
              `⚠️ Interrupted: ${message}`,
          }));
        },
      });
    } catch (err) {
      if (!started) {
        // Streaming never got going (bad status / no body / network) — fall
        // back to the non-streaming endpoint so the user still gets an answer.
        try {
          const { answer, sources, sql, usedDatasets } = await askUnified(
            question,
            history
          );
          patchLastMessage(() => ({ content: answer, sources, sql, usedDatasets }));
        } catch (err2) {
          patchLastMessage(() => ({
            content: `Error: ${err2 instanceof Error ? err2.message : "request failed"}`,
          }));
        }
      } else {
        // Mid-stream transport drop: keep the partial answer, mark it cut off.
        patchLastMessage((m) => ({
          content:
            (m.content ? m.content + "\n\n" : "") +
            `⚠️ Interrupted: ${err instanceof Error ? err.message : "connection lost"}`,
        }));
      }
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
                  : "rounded-lg border border-neutral-800 px-4 py-3 whitespace-pre-wrap"
              }
            >
              {m.role === "assistant" && m.content === "" ? (
                // Pre-stream: retrieval + SQL are running, no token yet.
                <span className="text-neutral-500 animate-pulse">Thinking…</span>
              ) : (
                m.content
              )}
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