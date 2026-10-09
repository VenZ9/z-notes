import { NextRequest, NextResponse } from "next/server";
import {
  createNote,
  getNote,
  listNotes,
  replaceNoteSources,
} from "@/lib/repository";
import { deriveTitle } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || undefined;
    const notes = await listNotes(q, 100);
    return NextResponse.json(notes);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load notes.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const topic = String(body.topic || "").trim();
    const content = String(body.content || "");
    const title = String(body.title || deriveTitle(content, topic)).trim();

    if (!topic && !title) {
      return NextResponse.json({ error: "Topic is required." }, { status: 400 });
    }

    let note = await createNote({
      title: title || topic,
      topic: topic || title,
      content,
      materials: Array.isArray(body.materials) ? body.materials : [],
      status: "draft",
    });

    if (Array.isArray(body.sources) && body.sources.length) {
      await replaceNoteSources(note.id, body.sources);
      note = await getNote(note.id);
    }

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create note.",
      },
      { status: 500 }
    );
  }
}
