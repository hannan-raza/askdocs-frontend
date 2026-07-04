"use client";

import { useState, useEffect, useRef } from "react";
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  type Doc,
} from "@/lib/api";

export default function DocumentsApp() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocs();
  }, []);

  async function loadDocs() {
    try {
      const list = await listDocuments();
      setDocs(list);
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await uploadDocument(file);
      const source = file.name;
      setProcessing((prev) => [...prev, source]);
      pollForDoc(source);
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : "error"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function pollForDoc(source: string) {
    const interval = setInterval(async () => {
      try {
        const list = await listDocuments();
        if (list.some((d) => d.source === source)) {
          setDocs(list);
          setProcessing((prev) => prev.filter((s) => s !== source));
          clearInterval(interval);
        }
      } catch {
        // keep polling
      }
    }, 5000);
    setTimeout(() => clearInterval(interval), 10 * 60 * 1000);
  }

  async function handleDelete(source: string) {
    if (!confirm(`Delete "${source}"?`)) return;
    try {
      await deleteDocument(source);
      await loadDocs();
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Your Documents</h2>
            <p className="text-sm text-neutral-400">
              Upload PDFs to chat with them. Only you can see your documents.
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-emerald-500"
            >
              {uploading ? "Uploading…" : "+ Upload PDF"}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {docs.map((d) => (
            <div
              key={d.source}
              className="group flex items-center justify-between rounded-lg border border-neutral-800 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{d.source}</div>
                <div className="text-xs text-neutral-500">{d.chunks} chunks</div>
              </div>
              <button
                onClick={() => handleDelete(d.source)}
                className="text-neutral-600 hover:text-red-400 text-sm opacity-0 group-hover:opacity-100"
                title="Delete"
              >
                Delete
              </button>
            </div>
          ))}

          {processing.map((source) => (
            <div
              key={`processing-${source}`}
              className="flex items-center justify-between rounded-lg border border-neutral-800 px-4 py-3 opacity-60"
            >
              <div className="truncate text-sm">{source}</div>
              <div className="text-xs text-emerald-400">processing…</div>
            </div>
          ))}

          {loaded && docs.length === 0 && processing.length === 0 && (
            <p className="text-sm text-neutral-600 py-8 text-center">
              No documents yet. Upload a PDF to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}