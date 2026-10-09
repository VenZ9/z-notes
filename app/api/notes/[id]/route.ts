import { NextRequest, NextResponse } from "next/server";
import {
  deleteNote,
  getNote,
  replaceNoteSources,
  updateNote,
} from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const note = await getNote(id);
    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    return NextResponse.json(note);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load note.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json();

    const note = await updateNote(id, {
      title: body.title,
      topic: body.topic,
      content: body.content,
      materials: body.materials,
      status: body.status,
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    if (Array.isArray(body.sources)) {
      await replaceNoteSources(note.id, body.sources);
      const refreshed = await getNote(note.id);
      return NextResponse.json(refreshed);
    }

    return NextResponse.json(note);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update note.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await deleteNote(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete note.",
      },
      { status: 500 }
    );
  }
}
