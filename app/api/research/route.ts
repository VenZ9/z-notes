import { NextRequest, NextResponse } from "next/server";
import { searchWeb } from "@/lib/research";
import { saveResearchRun } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body.query || "").trim();

    if (!query) {
      return NextResponse.json(
        { error: "Query is required.", warnings: [] },
        { status: 400 }
      );
    }

    const maxResults = Number(body.maxResults) || 5;
    const result = await searchWeb(query, maxResults);

    const runId = await saveResearchRun({
      query,
      provider: result.provider,
      status: result.sources.length
        ? "success"
        : result.ok
          ? "empty"
          : "error",
      results: result.sources,
      error: result.warnings.join(" ") || null,
    });

    return NextResponse.json({ ...result, runId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Research request failed.",
        warnings: [],
        sources: [],
      },
      { status: 500 }
    );
  }
}
