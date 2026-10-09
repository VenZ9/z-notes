"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import SourceList from "@/components/SourceList";
import { type ResearchResult, type Source } from "@/lib/types";

export default function ResearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(5);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) {
      setError("Enter a research query.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, maxResults }),
      });

      const data: ResearchResult = await res.json();

      if (!res.ok) {
        setError(data.warnings?.join(" ") || "Research failed.");
        return;
      }

      setResult(data);
      setSources(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed.");
    } finally {
      setBusy(false);
    }
  }

  async function generateFromResearch() {
    if (!query.trim()) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: query,
          sources,
          researchRunId: result?.runId,
          settings: { maxSources: sources.length || maxResults },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed.");
        return;
      }

      localStorage.setItem("znotes:selectNote", data.note.id);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="card p-4">
        <h1 className="text-xl font-semibold mb-1">Research</h1>
        <p className="muted small mb-4">
          Real web search using Tavily. Sources are preserved and used for
          citations. If research is unavailable, generated notes are marked
          unverified.
        </p>

        <div className="grid gap-3 md:grid-cols-12">
          <label className="md:col-span-8">
            <div className="font-medium mb-1">Query</div>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Example: quantum entanglement official NASA explanation"
              disabled={busy}
            />
          </label>

          <label className="md:col-span-2">
            <div className="font-medium mb-1">Max sources</div>
            <input
              className="input"
              type="number"
              min={1}
              max={8}
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              disabled={busy}
            />
          </label>

          <div className="md:col-span-2 flex items-end gap-2">
            <button
              className="btn btn-primary w-full"
              onClick={search}
              disabled={busy}
            >
              {busy ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="banner banner-error mt-3">{error}</div>
        ) : null}

        {result?.warnings?.length ? (
          <div className="banner banner-warn mt-3">
            <ul className="ml-4 list-disc small">
              {result.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8 card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Sources</h2>
            <button
              className="btn"
              onClick={generateFromResearch}
              disabled={busy || !sources.length}
            >
              Generate notes from these sources
            </button>
          </div>

          <SourceList sources={sources} />
        </div>

        <div className="lg:col-span-4 card p-4">
          <h2 className="font-semibold mb-2">Research metadata</h2>
          <dl className="small space-y-2">
            <div>
              <dt className="muted">Provider</dt>
              <dd>{result?.provider || "—"}</dd>
            </div>
            <div>
              <dt className="muted">Status</dt>
              <dd>{result?.ok ? "ok" : result ? "failed" : "—"}</dd>
            </div>
            <div>
              <dt className="muted">Source count</dt>
              <dd>{sources.length}</dd>
            </div>
            <div>
              <dt className="muted">Run ID</dt>
              <dd className="break-all">{result?.runId || "—"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
