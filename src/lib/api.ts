// Shared client-side API helpers for talking to the FastAPI backend.
// Every call attaches the Auth0 access token as a Bearer header.

// const API = process.env.NEXT_PUBLIC_API_URL;
const API = "/backend";

export type Doc = { source: string; chunks: number };

// A CSV dataset (text-to-SQL side of the knowledge base). Unlike PDFs, these
// are created synchronously and are deleted by numeric id, not source name.
export type Dataset = {
  id: number;
  source: string;
  rows: number;
  columns: { name: string }[];
};

// One entry per CSV/dataset the unified /ask query ran SQL against.
// Matches the backend `/ask` response shape (see backend ask.py).
export type SqlResult = {
  dataset_id: string;
  sql: string;
  columns: string[];
  rows: unknown[][];
};

export type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  sql?: SqlResult[];
  usedDatasets?: string[];
};

async function authHeaders(): Promise<HeadersInit> {
  const res = await fetch("/auth/access-token");
  if (!res.ok) return {};
  const data = await res.json();
  return { Authorization: `Bearer ${data.token}` };
}

// Shared POST-with-auth-and-JSON helper. Both askQuestion and askUnified use
// this so auth/error handling lives in one place (they differ only in path +
// response shape).
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function listDocuments(): Promise<Doc[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/documents`, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.documents ?? [];
}

export async function uploadDocument(file: File): Promise<void> {
  const headers = await authHeaders();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/upload`, { method: "POST", body: form, headers });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function deleteDocument(source: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/documents/${encodeURIComponent(source)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function listDatasets(): Promise<Dataset[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/datasets`, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.datasets ?? [];
}

// CSV upload is synchronous on the backend (the dataset is ready immediately),
// so unlike uploadDocument there's no "processing" step to poll for. The upload
// response omits the id, so callers should re-fetch listDatasets() afterward.
export async function uploadDataset(file: File): Promise<void> {
  const headers = await authHeaders();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/datasets/upload`, {
    method: "POST",
    body: form,
    headers,
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function deleteDataset(id: number): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/datasets/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function askQuestion(
  question: string,
  history: { role: string; content: string }[]
): Promise<{ answer: string; sources: string[] }> {
  const data = await postJson<{ answer: string; sources?: string[] }>(
    "/query",
    { question, history }
  );
  return { answer: data.answer, sources: data.sources ?? [] };
}

// Unified query: answers from the user's ENTIRE knowledge base (all PDFs AND
// all CSVs) in one call. This is what the chat uses now (see CLAUDE.md §7).
export async function askUnified(
  question: string,
  history: { role: string; content: string }[]
): Promise<{
  answer: string;
  sources: string[];
  sql: SqlResult[];
  usedDatasets: string[];
}> {
  const data = await postJson<{
    answer: string;
    sources?: string[];
    sql?: SqlResult[];
    used_datasets?: string[];
  }>("/ask", { question, history });
  return {
    answer: data.answer,
    sources: data.sources ?? [],
    // Guard the shape: the chat calls .length/.map on this, so a non-array
    // (unexpected backend response) would otherwise crash the message render.
    sql: Array.isArray(data.sql) ? data.sql : [],
    usedDatasets: data.used_datasets ?? [],
  };
}

// Callbacks for the streaming variant of the unified query. The caller drives
// its UI from these: append `onToken` text live, attach `onMetadata` fields to
// the finished message, and surface `onError` (partial answer stays visible).
export type AskStreamHandlers = {
  onToken: (text: string) => void;
  onMetadata: (meta: {
    sources: string[];
    sql: SqlResult[];
    usedDatasets: string[];
  }) => void;
  onError: (message: string) => void;
};

// Streaming unified query: same request as askUnified but with ?stream=true, so
// the backend answers as Server-Sent Events and the answer types out live.
// SSE contract (in order): repeated {type:"token",text}, optional
// {type:"error",message}, always a final {type:"metadata",...}, then [DONE].
// The metadata frame mirrors the non-streaming JSON fields exactly.
//
// This resolves when the stream ends ([DONE] or the body closes). Frame-level
// failures arrive via onError; transport failures (bad status, no body, network
// drop) throw so the caller can fall back to the non-streaming askUnified.
export async function askUnifiedStream(
  question: string,
  history: { role: string; content: string }[],
  handlers: AskStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const headers = await authHeaders();
  // Not the /backend rewrite: SSE goes through a dedicated Route Handler
  // (app/api/ask-stream) that pipes the stream through un-buffered. The rewrite
  // buffers responses, which would defeat token-by-token streaming.
  const res = await fetch(`/api/ask-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ question, history }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`API error: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // SSE frames are newline-delimited "data: {...}" lines. We buffer raw bytes
  // and process one complete line at a time; a partial line stays in `buffer`
  // until the next chunk completes it.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue; // skip comments/keep-alives

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;

      let evt: {
        type?: string;
        text?: string;
        message?: string;
        sources?: string[];
        sql?: SqlResult[];
        used_datasets?: string[];
      };
      try {
        evt = JSON.parse(payload);
      } catch {
        continue; // ignore a malformed frame rather than aborting the stream
      }

      if (evt.type === "token") {
        handlers.onToken(evt.text ?? "");
      } else if (evt.type === "metadata") {
        handlers.onMetadata({
          sources: evt.sources ?? [],
          sql: Array.isArray(evt.sql) ? evt.sql : [],
          usedDatasets: evt.used_datasets ?? [],
        });
      } else if (evt.type === "error") {
        handlers.onError(evt.message ?? "the answer was interrupted");
      }
    }
  }
}
