"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SourceList from "@/components/SourceList";
import { type ResearchRun } from "@/lib/types";

export default function HistoryPage() {
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/history");
    if (res.ok) setRuns(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function clearAll() {
    if (!confirm("Clear all research history?")) return;

    setBusy(true);
    await fetch("/api/history", { method: "DELETE" });
    await load();
    setBusy(false);
  }

  async function deleteRun(id: string) {
    setBusy(true);
    await fetch(`/api/history/${id}`, { method: "DELETE" });
    await load();
    setBusy(false);
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="card p-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Research history</h1>
          <p className="muted small">
            Saved searches, retrieved sources, and linked notes.
          </p>
        </div>

        <button className="btn btn-danger" onClick={clearAll} disabled={busy}>
          Clear history
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="card p-4 muted">No research history yet.</div>
      ) : (
        runs.map((run) => (
          <div key={run.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium">{run.query}</div>
                <div className="muted small">
                  {new Date(run.createdAt).toLocaleString()} · {run.provider} ·{" "}
                  {run.status} · {run.results.length} sources
                </div>
              </div>

              <div className="flex gap-2">
                {run.noteId ? (
                  <Link
                    className="btn"
                    href="/"
                    onClick={() =>
                      localStorage.setItem("znotes:selectNote", run.noteId!)
                    }
                  >
                    Open note
                  </Link>
                ) : null}

                <button
                  className="btn"
                  onClick={() =>
                    setExpanded(expanded === run.id ? null : run.id)
                  }
                >
                  {expanded === run.id ? "Hide sources" : "View sources"}
                </button>

                <button
                  className="btn btn-danger"
                  onClick={() => deleteRun(run.id)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            </div>

            {run.error ? (
              <div className="banner banner-error mt-3 small">{run.error}</div>
            ) : null}

            {expanded === run.id ? (
              <div className="mt-3">
                <SourceList sources={run.results} />
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
