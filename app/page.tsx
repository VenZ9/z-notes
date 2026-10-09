"use client";

import { useEffect, useRef, useState } from "react";
import SourceList from "@/components/SourceList";
import { renderMarkdown } from "@/lib/markdown";
import {
  DEFAULT_PREFERENCES,
  type Material,
  type Note,
  type Preferences,
  type ProviderStatus,
  type Source,
} from "@/lib/types";
import { deriveTitle, slugify } from "@/lib/utils";

const ALLOWED_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json", ".pdf"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MATERIAL_CHARS = 20000;
const MAX_TOTAL_CHARS = 60000;

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [search, setSearch] = useState("");

  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sources, setSources] = useState<Source[]>([]);

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  const fileRef = useRef<HTMLInputElement>(null);

  async function refreshNotes(q = search) {
    const res = await fetch(`/api/notes?q=${encodeURIComponent(q)}`);
    if (res.ok) setNotes(await res.json());
  }

  async function selectNote(id: string) {
    const res = await fetch(`/api/notes/${id}`);
    if (!res.ok) return;

    const note: Note = await res.json();
    setSelected(note);
    setTopic(note.topic);
    setContent(note.content);
    setMaterials(note.materials || []);
    setSources(note.sources || []);
    setMode("view");
    setError(null);
    setWarnings([]);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshNotes();
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetch("/api/providers/status")
      .then((r) => (r.ok ? r.json() : []))
      .then(setStatuses)
      .catch(() => {});

    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : DEFAULT_PREFERENCES))
      .then(setPrefs)
      .catch(() => {});

    const pending = localStorage.getItem("znotes:selectNote");
    if (pending) {
      localStorage.removeItem("znotes:selectNote");
      selectNote(pending);
    }
  }, []);

  function newNote() {
    setSelected(null);
    setTopic("");
    setContent("");
    setMaterials([]);
    setSources([]);
    setMode("edit");
    setError(null);
    setWarnings([]);
  }

  function getExtension(file: File) {
    const name = file.name.toLowerCase();
    const index = name.lastIndexOf(".");
    return index >= 0 ? name.slice(index) : "";
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const accepted: Material[] = [];
    const localErrors: string[] = [];

    for (const file of Array.from(fileList)) {
      const ext = getExtension(file);

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        localErrors.push(`${file.name}: unsupported file type.`);
        continue;
      }

      if (file.size > MAX_FILE_BYTES) {
        localErrors.push(`${file.name}: exceeds 5 MB limit.`);
        continue;
      }

      try {
        let text = "";

        if (ext === ".pdf") {
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/extract", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            localErrors.push(
              `${file.name}: ${data.error || "PDF extraction failed."}`
            );
            continue;
          }

          const data = await res.json();
          text = data.text || "";
        } else {
          text = await file.text();
        }

        text = text.replace(/\u0000/g, "").trim();

        if (!text) {
          localErrors.push(`${file.name}: no extractable text.`);
          continue;
        }

        if (text.length > MAX_MATERIAL_CHARS) {
          text = text.slice(0, MAX_MATERIAL_CHARS);
        }

        accepted.push({ name: file.name, text });
      } catch (err) {
        localErrors.push(
          `${file.name}: ${err instanceof Error ? err.message : "upload failed."}`
        );
      }
    }

    if (localErrors.length) setError(localErrors.join(" "));

    if (accepted.length) {
      setMaterials((prev) => {
        const next = [...prev, ...accepted];
        let total = 0;

        return next
          .map((material) => {
            if (total >= MAX_TOTAL_CHARS) {
              return { ...material, text: "", truncated: true };
            }

            const remaining = MAX_TOTAL_CHARS - total;

            if (material.text.length > remaining) {
              total = MAX_TOTAL_CHARS;
              return {
                ...material,
                text: material.text.slice(0, remaining),
                truncated: true,
              };
            }

            total += material.text.length;
            return material;
          })
          .filter((material) => material.text.length > 0 || material.truncated);
      });
    }

    if (fileRef.current) fileRef.current.value = "";
  }

  function removeMaterial(index: number) {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  }

  async function generate(regenerate = false) {
    const effectiveTopic = (topic || selected?.topic || "").trim();

    if (!effectiveTopic) {
      setError("Enter a topic or question.");
      return;
    }

    setBusy(true);
    setError(null);
    setWarnings([]);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: effectiveTopic,
          noteId: regenerate ? selected?.id : selected?.id,
          materials,
          settings: prefs.settings,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed.");
        if (data.note) {
          setSelected(data.note);
          setContent(data.note.content);
          setSources(data.note.sources || []);
        }
        if (data.warnings) setWarnings(data.warnings);
        await refreshNotes();
        return;
      }

      setSelected(data.note);
      setTopic(data.note.topic);
      setContent(data.note.content);
      setMaterials(data.note.materials || []);
      setSources(data.note.sources || []);
      setWarnings([
        ...(data.research?.warnings || []),
        ...(data.warnings || []),
      ]);
      setMode("view");
      await refreshNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    const effectiveTopic = (topic || selected?.topic || "").trim();
    const title = deriveTitle(content, effectiveTopic || "Untitled note");

    setBusy(true);
    setError(null);

    try {
      const payload = {
        title,
        topic: effectiveTopic || title,
        content,
        materials,
      };

      const res = selected
        ? await fetch(`/api/notes/${selected.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Save failed.");
        return;
      }

      setSelected(data);
      setTopic(data.topic);
      setSources(data.sources || []);
      await refreshNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteNote() {
    if (!selected) return;
    if (!confirm("Delete this note?")) return;

    setBusy(true);
    await fetch(`/api/notes/${selected.id}`, { method: "DELETE" });
    setSelected(null);
    setTopic("");
    setContent("");
    setMaterials([]);
    setSources([]);
    await refreshNotes();
    setBusy(false);
  }

  function copyNote() {
    navigator.clipboard.writeText(content).catch(() => {
      setError("Copy failed.");
    });
  }

  function download(filename: string, text: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    const title = deriveTitle(content, topic || selected?.topic || "note");
    download(`${slugify(title)}.md`, content, "text/markdown");
  }

  function exportJson() {
    const title = deriveTitle(content, topic || selected?.topic || "note");
    download(
      `${slugify(title)}.json`,
      JSON.stringify({ note: selected, content, sources, materials }, null, 2),
      "application/json"
    );
  }

  const activeProvider = selected?.provider;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <section className="lg:col-span-3 card p-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold">Notes</h2>
          <button className="btn" onClick={newNote} disabled={busy}>
            New
          </button>
        </div>

        <input
          className="input mb-3"
          placeholder="Search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex flex-col gap-1 max-h-[60vh] overflow-auto">
          {notes.length === 0 ? (
            <p className="muted small">No notes yet.</p>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                className={`nav-link text-left ${
                  selected?.id === note.id ? "nav-link-active" : ""
                }`}
                onClick={() => selectNote(note.id)}
                disabled={busy}
              >
                <div className="w-full">
                  <div className="font-medium truncate">{note.title}</div>
                  <div className="muted small">
                    {new Date(note.updatedAt).toLocaleDateString()} ·{" "}
                    {note.sourceCount ?? 0} sources
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="lg:col-span-9 space-y-4">
        <div className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Z-Notes workspace</h1>
              <p className="muted small">
                Generate structured notes from topics, questions, and uploaded
                study materials.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <span
                  key={status.name}
                  className={`badge ${
                    status.modelAvailable === "available"
                      ? "badge-ok"
                      : status.enabled
                        ? "badge-warn"
                        : ""
                  }`}
                  title={status.message || status.model}
                >
                  {status.label}: {status.modelAvailable}
                </span>
              ))}
              {activeProvider ? (
                <span className="badge badge-ok">Active: {activeProvider}</span>
              ) : null}
            </div>
          </div>
        </div>

        {error ? (
          <div className="banner banner-error">
            <strong>Error:</strong> {error}
          </div>
        ) : null}

        {warnings.length ? (
          <div className="banner banner-warn">
            <strong>Warnings:</strong>
            <ul className="mt-1 ml-4 list-disc">
              {warnings.map((warning, index) => (
                <li key={index} className="small">
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="card p-4 space-y-3">
          <label className="block">
            <div className="font-medium mb-1">Topic or question</div>
            <textarea
              className="textarea"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Example: Explain photosynthesis, including light-dependent reactions and Calvin cycle."
              disabled={busy}
            />
          </label>

          <div>
            <div className="font-medium mb-1">Study materials</div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ALLOWED_EXTENSIONS.join(",")}
              onChange={(e) => handleFiles(e.target.files)}
              disabled={busy}
            />
            <p className="muted small mt-1">
              Supported: .txt, .md, .markdown, .csv, .json, .pdf. Max 5 MB per
              file.
            </p>

            {materials.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {materials.map((material, index) => (
                  <span key={`${material.name}-${index}`} className="badge">
                    {material.name}
                    {material.truncated ? " (truncated)" : ""}
                    <button
                      className="ml-2 muted"
                      onClick={() => removeMaterial(index)}
                      disabled={busy}
                      aria-label={`Remove ${material.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              onClick={() => generate(false)}
              disabled={busy}
            >
              {busy ? "Working..." : "Generate notes"}
            </button>

            <button
              className="btn"
              onClick={() => generate(true)}
              disabled={busy || !selected}
            >
              Regenerate
            </button>

            <button className="btn" onClick={saveNote} disabled={busy}>
              Save
            </button>

            <button className="btn" onClick={copyNote} disabled={busy}>
              Copy
            </button>

            <button className="btn" onClick={exportMarkdown} disabled={busy}>
              Export .md
            </button>

            <button className="btn" onClick={exportJson} disabled={busy}>
              Export .json
            </button>

            <button
              className="btn btn-danger"
              onClick={deleteNote}
              disabled={busy || !selected}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8 card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Notes</h2>

              <div className="flex gap-2">
                <button
                  className={`btn ${mode === "view" ? "btn-primary" : ""}`}
                  onClick={() => setMode("view")}
                  disabled={busy}
                >
                  View
                </button>
                <button
                  className={`btn ${mode === "edit" ? "btn-primary" : ""}`}
                  onClick={() => setMode("edit")}
                  disabled={busy}
                >
                  Edit
                </button>
              </div>
            </div>

            {!content && !topic ? (
              <p className="muted">
                Enter a topic, ask a question, or upload materials to generate
                notes.
              </p>
            ) : mode === "edit" ? (
              <textarea
                className="textarea font-mono text-sm min-h-[500px]"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={busy}
              />
            ) : (
              <article
                className="prose-notes"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(content, sources.length),
                }}
              />
            )}
          </div>

          <div className="xl:col-span-4 card p-4">
            <h2 className="font-semibold mb-3">Sources</h2>
            <SourceList sources={sources} />
          </div>
        </div>
      </section>
    </div>
  );
}
