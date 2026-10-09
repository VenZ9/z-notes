import { NextRequest, NextResponse } from "next/server";
import { getPreferences, savePreferences } from "@/lib/repository";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prefs = await getPreferences();
    return NextResponse.json(prefs);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load preferences.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    const prefs: Preferences = {
      theme:
        body.theme === "light" ||
        body.theme === "dark" ||
        body.theme === "system"
          ? body.theme
          : DEFAULT_PREFERENCES.theme,
      settings: {
        ...DEFAULT_PREFERENCES.settings,
        ...(body.settings || {}),
      },
      providerPriority: Array.isArray(body.providerPriority)
        ? body.providerPriority
        : DEFAULT_PREFERENCES.providerPriority,
    };

    const saved = await savePreferences(prefs);
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save preferences.",
      },
      { status: 500 }
    );
  }
}
