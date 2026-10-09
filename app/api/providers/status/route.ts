import { NextRequest, NextResponse } from "next/server";
import { getProviderStatuses } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const statuses = await getProviderStatuses(force);
    return NextResponse.json(statuses);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to check providers.",
      },
      { status: 500 }
    );
  }
}
