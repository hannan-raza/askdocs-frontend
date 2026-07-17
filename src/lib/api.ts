// Shared client-side API helpers for talking to the FastAPI backend.
// Every call attaches the Auth0 access token as a Bearer header.

// const API = process.env.NEXT_PUBLIC_API_URL;
const API = "/backend";

export type Doc = { source: string; chunks: number };

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
    sql: data.sql ?? [],
    usedDatasets: data.used_datasets ?? [],
  };
}
