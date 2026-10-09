import {
  type GenerationSettings,
  type Material,
  type Source,
} from "./types";
import { truncate } from "./utils";

interface BuildMessagesInput {
  topic: string;
  materials: Material[];
  sources: Source[];
  settings: GenerationSettings;
}

export function buildMessages({
  topic,
  materials,
  sources,
  settings,
}: BuildMessagesInput) {
  const depth = settings.depth || "standard";
  const detail =
    depth === "brief"
      ? "concise"
      : depth === "thorough"
        ? "very detailed"
        : "balanced";

  const system = `You are Z-Notes, an academic note generator.

Rules:
- Produce ${detail} structured study notes in Markdown.
- Use only the provided verified web sources and user-uploaded materials.
- Cite factual claims from web sources with bracketed numbers like [1], [2].
- If a claim is not supported by the provided web sources, mark it as [unverified].
- Never invent sources, URLs, quotations, publication details, or facts.
- If sources are insufficient, explicitly state what could not be verified.
- User-uploaded materials are not independently web-verified. Summarize them clearly and label material-specific insights as "From uploaded material".
- Do not output a bibliography or source list. The application displays sources separately.
- Use this structure:
  # Title
  ## Summary
  ## Key Concepts
  ## Definitions
  ## Detailed Explanation
  ## Uploaded Material Insights (only if materials were provided)
  ## Revision Questions
  ## Uncertainties and Gaps`;

  const sourceBlock = sources.length
    ? sources
        .map(
          (source) =>
            `[${source.ordinal}] ${source.title}
Domain: ${source.domain}
Reliability: ${source.reliability}
URL: ${source.url}
Snippet: ${truncate(source.snippet, 500)}
Excerpt: ${truncate(source.excerpt || "", 900)}`
        )
        .join("\n\n")
    : "No verified web sources were retrieved.";

  const materialBlock = materials.length
    ? materials
        .map(
          (material, index) =>
            `--- Uploaded material ${index + 1}: ${material.name} ---
${truncate(material.text, 12000)}`
        )
        .join("\n\n")
    : "None.";

  const user = `Create study notes for this topic or question:

${topic}

Verified web sources:
${sourceBlock}

User-uploaded materials:
${materialBlock}

Requirements:
- Include clear headings.
- Include explanations, key concepts, definitions, summary, and revision questions.
- Use citation markers like [1] only for the numbered verified web sources above.
- Use [unverified] where support is missing.
- Keep the output within approximately ${settings.maxTokens || 1800} tokens.`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

export function sanitizeCitations(text: string, sourceCount: number) {
  return text
    .replace(/\[(\d+)\]/g, (match, num) => {
      const n = Number(num);
      return n >= 1 && n <= sourceCount ? match : "[unverified]";
    })
    .replace(/\[unverified\]\s*\[unverified\]/g, "[unverified]");
}
