import { type ResearchResult, type Source } from "./types";
import { clamp, cleanText, getDomain } from "./utils";

const HIGH_TRUST_SUFFIXES = [".gov", ".edu", ".mil"];

const HIGH_TRUST_DOMAINS = new Set([
  "who.int",
  "nasa.gov",
  "nih.gov",
  "cdc.gov",
  "europa.eu",
  "unesco.org",
  "arxiv.org",
  "acm.org",
  "ieee.org",
  "nature.com",
  "science.org",
  "cell.com",
  "plos.org",
  "bmj.com",
  "stanford.edu",
  "mit.edu",
  "harvard.edu",
  "ox.ac.uk",
  "cam.ac.uk",
]);

const REFERENCE_DOMAINS = new Set([
  "wikipedia.org",
  "wikimedia.org",
  "britannica.com",
  "merriam-webster.com",
  "plato.stanford.edu",
]);

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    const params = parsed.searchParams;
    for (const key of Array.from(params.keys())) {
      if (
        key.startsWith("utm_") ||
        key === "ref" ||
        key === "fbclid" ||
        key === "gclid"
      ) {
        params.delete(key);
      }
    }

    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");

    return `${parsed.origin}${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function scoreSource(url: string, title: string, snippet: string) {
  const domain = getDomain(url);
  const combined = `${domain} ${title} ${snippet}`.toLowerCase();

  if (!domain) return 0;

  if (HIGH_TRUST_DOMAINS.has(domain)) return 95;

  if (HIGH_TRUST_SUFFIXES.some((suffix) => domain.endsWith(suffix))) return 95;

  if (domain.endsWith(".int")) return 90;

  if (REFERENCE_DOMAINS.has(domain)) return 80;

  if (domain.startsWith("docs.") || combined.includes("/docs")) return 85;

  if (domain.endsWith(".org")) return 70;
  if (domain.endsWith(".net")) return 60;
  if (domain.endsWith(".com")) return 50;

  if (combined.includes("blog") || domain.includes("medium.com")) return 35;

  return 40;
}

export async function searchWeb(
  query: string,
  maxResults = 5
): Promise<ResearchResult> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  const endpoint =
    process.env.TAVILY_SEARCH_ENDPOINT?.trim() ||
    "https://api.tavily.com/search";

  if (!apiKey) {
    return {
      ok: false,
      provider: "tavily",
      query,
      sources: [],
      warnings: [
        "Research provider is not configured. Set TAVILY_API_KEY to verify facts from real web sources.",
      ],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: clamp(maxResults, 1, 8),
        include_answer: true,
        include_raw_content: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        provider: "tavily",
        query,
        sources: [],
        warnings: [
          `Search provider returned ${response.status}. ${cleanText(text).slice(0, 200)}`,
        ],
      };
    }

    const data = await response.json().catch(() => null);
    const rawResults = Array.isArray(data?.results) ? data.results : [];
    const warnings: string[] = [];

    const seen = new Set<string>();
    const sources: Source[] = [];

    for (const item of rawResults) {
      const url = typeof item?.url === "string" ? item.url.trim() : "";
      if (!/^https?:\/\//i.test(url)) continue;

      const normalized = normalizeUrl(url);
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      const title = cleanText(item?.title || url) || url;
      const snippet = cleanText(item?.content || "");
      const excerpt = cleanText(item?.raw_content || "").slice(0, 1200);
      const domain = getDomain(url);
      const reliability = scoreSource(url, title, snippet);

      sources.push({
        ordinal: 0,
        title,
        url,
        domain,
        snippet,
        excerpt: excerpt || undefined,
        publishedAt:
          typeof item?.published_date === "string"
            ? item.published_date
            : undefined,
        reliability,
      });
    }

    sources.sort((a, b) => b.reliability - a.reliability);

    const limited = sources.slice(0, clamp(maxResults, 1, 8));

    limited.forEach((source, index) => {
      source.ordinal = index + 1;
    });

    if (limited.length === 0) {
      warnings.push(
        "No usable web sources were returned. Any generated claims should be treated as unverified."
      );
    } else if (limited[0].reliability < 50) {
      warnings.push(
        "Retrieved sources have low reliability scores. Verify important claims manually."
      );
    }

    return {
      ok: true,
      provider: "tavily",
      query,
      sources: limited,
      warnings,
      answer: typeof data?.answer === "string" ? data.answer : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "tavily",
      query,
      sources: [],
      warnings: [
        `Search request failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  } finally {
    clearTimeout(timeout);
  }
}
