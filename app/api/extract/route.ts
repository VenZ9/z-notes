import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".pdf",
];

function getExtension(name: string) {
  const index = name.toLowerCase().lastIndexOf(".");
  return index >= 0 ? name.toLowerCase().slice(index) : "";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const ext = getExtension(file.name);

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Unsupported file type." },
        { status: 415 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 5 MB limit." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (ext === ".pdf") {
      // @ts-ignore
      const mod: any = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = mod.default ?? mod;
      const parsed = await pdfParse(buffer);
      text = String(parsed?.text || "");
    } else {
      text = new TextDecoder().decode(buffer);
    }

    text = text.replace(/\u0000/g, "").trim();

    const maxChars = 50000;
    const truncated = text.length > maxChars;

    if (truncated) {
      text = text.slice(0, maxChars);
    }

    return NextResponse.json({
      name: file.name,
      text,
      truncated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "File extraction failed.",
      },
      { status: 500 }
    );
  }
}
