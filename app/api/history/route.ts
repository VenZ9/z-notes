import { NextResponse } from "next/server";
import { clearResearchRuns, listResearchRuns } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runs = await listResearchRuns(100);
    return NextResponse.json(runs);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load history.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearResearchRuns();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to clear history.",
      },
      { status: 500 }
    );
  }
}
