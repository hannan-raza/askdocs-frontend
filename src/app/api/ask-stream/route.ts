// Streaming proxy for POST /ask?stream=true.
//
// The normal /backend/* rewrite (next.config.ts) BUFFERS responses, so SSE
// tokens arrive all-at-once in the browser. This Route Handler instead pipes
// the backend's ReadableStream straight back to the client without ever reading
// or awaiting it — that's what preserves token-by-token streaming.
//
// Only the streaming /ask call uses this route; every other endpoint still goes
// through the /backend rewrite. Runs server-side on Vercel, so the backend HTTP
// call is server→server (no browser mixed-content concern).

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache; always stream live

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function POST(req: Request): Promise<Response> {
  // Forward the client's Bearer token and JSON body verbatim.
  const auth = req.headers.get("authorization");
  const body = await req.text();

  let backendRes: Response;
  try {
    backendRes = await fetch(`${API_URL}/ask?stream=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body,
    });
  } catch {
    // Backend unreachable — signal failure so the client falls back to the
    // non-streaming askUnified.
    return new Response("upstream unavailable", { status: 502 });
  }

  // Propagate a non-OK status (and don't stream) so the client's catch fires.
  if (!backendRes.ok || !backendRes.body) {
    return new Response(await backendRes.text().catch(() => ""), {
      status: backendRes.status || 502,
    });
  }

  // Pipe the SSE stream straight through — no await/read of the body.
  return new Response(backendRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
