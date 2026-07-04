// Shared client-side API helpers for talking to the FastAPI backend.
// Every call attaches the Auth0 access token as a Bearer header.

const API = process.env.NEXT_PUBLIC_API_URL;

export type Doc = { source: string; chunks: number };

export type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

async function authHeaders(): Promise<HeadersInit> {
  const res = await fetch("/auth/access-token");
  if (!res.ok) return {};
  const data = await res.json();
  return { Authorization: `Bearer ${data.token}` };
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
  const headers = await authHeaders();
  const res = await fetch(`${API}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ question, history }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return { answer: data.answer, sources: data.sources ?? [] };
}
