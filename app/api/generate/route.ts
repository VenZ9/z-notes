import { NextRequest, NextResponse } from "next/server";
import { buildMessages, sanitizeCitations } from "@/lib/generation";
import { AllProvidersError, generateWithFailover } from "@/lib/providers";
import { searchWeb } from "@/lib/research";
import {
  attachResearchRunNote,
  createNote,
  getNote,
  replaceNoteSources,
  saveResearchRun,
  updateNote,
} from "@/lib/repository";
import { DEFAULT_PREFERENCES, type Source } from "@/lib/types";
import { deriveTitle, getDomain } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeSource(input: any, index: number): Source | null {
  const url = typeof input?.url === "string" ? input.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) return null;

  return {
    ordinal: Number(input?.ordinal) || index + 1,
    title: String(input?.title || url),
    url,
    domain: String(input?.domain || getDomain(url)),
    snippet: String(input?.snippet || ""),
    excerpt: input?.excerpt ? String(input.excerpt) : undefined,
    publishedAt: input?.publishedAt ? String(input.publishedAt) : undefined,
    reliability: Number(input?.reliability) || 0,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const topic = String(body.topic || "").trim();
    if (!topic) {
      return NextResponse.json(
        { error: "Topic is required." },
        { status: 400 }
      );
    }

    const materials = Array.isArray(body.materials)
      ? body.materials
          .filter(
            (m: any) =>
              typeof m?.name === "string" && typeof m?.text === "string"
          )
          .map((m: any) => ({
            name: String(m.name).slice(0, 200),
            text: String(m.text).slice(0, 20000),
            truncated: Boolean(m.truncated),
          }))
      : [];

    const settings = {
      ...DEFAULT_PREFERENCES.settings,
      ...(body.settings || {}),
    };

    let note = body.noteId
      ? await updateNote(String(body.noteId), {
          topic,
          title: deriveTitle("", topic),
          materials,
          status: "generating",
          error: null,
        })
      : await createNote({
          title: deriveTitle("", topic),
          topic,
          content: "",
          materials,
          status: "generating",
        });

    if (!note) {
      return NextResponse.json(
        { error: "Failed to create note." },
        { status: 500 }
      );
    }

    const providedSources = Array.isArray(body.sources)
      ? (body.sources
          .map(normalizeSource)
          .filter(Boolean) as Source[])
      : [];

    const research = providedSources.length
      ? {
          ok: true,
          provider: "provided",
          query: topic,
          sources: providedSources,
          warnings: [] as string[],
        }
      : await searchWeb(topic, settings.maxSources || 5);

    const sources = research.sources;

    if (body.researchRunId) {
      await attachResearchRunNote(String(body.researchRunId), note.id);
    } else {
      await saveResearchRun({
        query: topic,
        provider: research.provider,
        status: sources.length
          ? "success"
          : research.ok
            ? "empty"
            : "error",
        results: sources,
        error: research.warnings.join(" ") || null,
        noteId: note.id,
      });
    }

    const messages = buildMessages({
      topic,
      materials,
      sources,
      settings,
    });

    try {
      const result = await generateWithFailover(messages, settings, body.priority);

      const content = sanitizeCitations(result.text, sources.length);

      await updateNote(note.id, {
        title: deriveTitle(content, topic),
        content,
        provider: result.provider,
        model: result.model,
        status: "ready",
        error: null,
      });

      await replaceNoteSources(note.id, sources);

      const finalNote = await getNote(note.id);

      return NextResponse.json({
        note: finalNote,
        sources,
        provider: result.provider,
        model: result.model,
        research: {
          ok: research.ok && sources.length > 0,
          warnings: research.warnings,
        },
        warnings: result.warnings,
      });
    } catch (error) {
      const allFailed = error instanceof AllProvidersError ? error : null;

      const message = allFailed
        ? allFailed.message
        : error instanceof Error
          ? error.message
          : "Generation failed.";

      const details = allFailed
        ? allFailed.attempts
            .map((attempt) => `${attempt.provider}: ${attempt.message}`)
            .join("; ")
        : String(error);

      const providerWarnings = allFailed ? allFailed.warnings : [];

      await updateNote(note.id, {
        status: "error",
        error: `${message}${details ? ` — ${details}` : ""}`,
      });

      await replaceNoteSources(note.id, sources);

      const finalNote = await getNote(note.id);

      return NextResponse.json(
        {
          error: message,
          details,
          note: finalNote,
          sources,
          research: {
            ok: research.ok && sources.length > 0,
            warnings: research.warnings,
          },
          warnings: providerWarnings,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Generation request failed.",
      },
      { status: 500 }
    );
  }
}
