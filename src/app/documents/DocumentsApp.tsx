"use client";

import { useState, useEffect, useRef } from "react";
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  listDatasets,
  uploadDataset,
  deleteDataset,
  type Doc,
  type Dataset,
} from "@/lib/api";

export default function DocumentsApp() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([loadDocs(), loadDatasets()]).finally(() => setLoaded(true));
  }, []);

  async function loadDocs() {
    try {
      setDocs(await listDocuments());
    } catch {
      // ignore
    }
  }

  async function loadDatasets() {
    try {
      setDatasets(await listDatasets());
    } catch {
      // ignore
    }
  }

  // One input for both types: PDFs go to the RAG pipeline (async → poll for
  // "processing…"); CSVs become datasets synchronously (appear immediately).
  // `accept` is only a hint, so reject anything else rather than silently
  // sending it to the PDF pipeline (where it would hang on "processing…").
  async function handleUpload(file: File) {
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith(".csv");
    const isPdf = name.endsWith(".pdf");
    if (!isCsv && !isPdf) {
      alert("Unsupported file type. Please upload a PDF or CSV.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      if (isCsv) {
        await uploadDataset(file);
        // No id in the upload response, so re-fetch to get the full row.
        await loadDatasets();
      } else {
        await uploadDocument(file);
        const source = file.name;
        setProcessing((prev) => [...prev, source]);
        pollForDoc(source);
      }
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

  async function handleDeleteDoc(source: string) {
    if (!confirm(`Delete "${source}"?`)) return;
    try {
      await deleteDocument(source);
      await loadDocs();
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  async function handleDeleteDataset(id: number, source: string) {
    if (!confirm(`Delete "${source}"?`)) return;
    try {
      await deleteDataset(id);
      await loadDatasets();
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  const isEmpty =
    docs.length === 0 && datasets.length === 0 && processing.length === 0;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Your Documents</h2>
            <p className="text-sm text-neutral-400">
              Upload PDFs and CSVs to chat with them. Only you can see your data.
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,application/pdf,text/csv"
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
              {uploading ? "Uploading…" : "+ Upload PDF or CSV"}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {docs.map((d) => (
            <div
              key={`pdf-${d.source}`}
              className="group flex items-center justify-between rounded-lg border border-neutral-800 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-400">
                    PDF
                  </span>
                  <span className="truncate text-sm">{d.source}</span>
                </div>
                <div className="text-xs text-neutral-500">{d.chunks} chunks</div>
              </div>
              <button
                onClick={() => handleDeleteDoc(d.source)}
                className="text-neutral-600 hover:text-red-400 text-sm opacity-0 group-hover:opacity-100"
                title="Delete"
              >
                Delete
              </button>
            </div>
          ))}

          {datasets.map((ds) => (
            <div
              key={`csv-${ds.id}`}
              className="group flex items-center justify-between rounded-lg border border-neutral-800 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-400">
                    CSV
                  </span>
                  <span className="truncate text-sm">{ds.source}</span>
                </div>
                <div className="text-xs text-neutral-500">
                  {ds.rows} rows · {ds.columns?.length ?? 0} columns
                </div>
              </div>
              <button
                onClick={() => handleDeleteDataset(ds.id, ds.source)}
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

          {loaded && isEmpty && (
            <p className="text-sm text-neutral-600 py-8 text-center">
              No documents yet. Upload a PDF or CSV to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
