import { randomUUID } from "node:crypto";
import { query } from "./db";
import {
  DEFAULT_PREFERENCES,
  type Material,
  type Note,
  type Preferences,
  type ResearchRun,
  type Source,
} from "./types";

function parseJson(value: any, fallback: any) {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function mapNote(row: any, sources?: Source[]): Note {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    content: row.content ?? "",
    provider: row.provider ?? null,
    model: row.model ?? null,
    status: row.status ?? "draft",
    error: row.error ?? null,
    materials: parseJson(row.materials, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceCount: row.source_count ?? sources?.length ?? 0,
    sources,
  };
}

function mapSource(row: any): Source {
  return {
    ordinal: row.ordinal,
    title: row.title || row.url,
    url: row.url,
    domain: row.domain || "",
    snippet: row.snippet || "",
    excerpt: row.excerpt || undefined,
    publishedAt: row.published_at || undefined,
    reliability: row.reliability ?? 0,
  };
}

function mapResearchRun(row: any): ResearchRun {
  return {
    id: row.id,
    query: row.query,
    provider: row.provider,
    status: row.status,
    results: parseJson(row.results, []),
    error: row.error ?? null,
    noteId: row.note_id ?? null,
    createdAt: row.created_at,
  };
}

export async function createNote(input: {
  title: string;
  topic: string;
  content?: string;
  materials?: Material[];
  status?: string;
  provider?: string | null;
  model?: string | null;
  error?: string | null;
}) {
  const id = randomUUID();

  await query(
    `
    INSERT INTO notes (
      id, title, topic, content, provider, model, status, error, materials
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      id,
      input.title,
      input.topic,
      input.content ?? "",
      input.provider ?? null,
      input.model ?? null,
      input.status ?? "draft",
      input.error ?? null,
      JSON.stringify(input.materials ?? []),
    ]
  );

  return getNote(id);
}

export async function getNote(id: string): Promise<Note | null> {
  const { rows } = await query(
    `
    SELECT
      n.*,
      (SELECT COUNT(*)::int FROM note_sources s WHERE s.note_id = n.id) AS source_count
    FROM notes n
    WHERE n.id = $1
    `,
    [id]
  );

  if (!rows[0]) return null;

  const sources = await getNoteSources(id);
  return mapNote(rows[0], sources);
}

export async function listNotes(search?: string, limit = 100): Promise<Note[]> {
  const { rows } = await query(
    `
    SELECT
      n.*,
      (SELECT COUNT(*)::int FROM note_sources s WHERE s.note_id = n.id) AS source_count
    FROM notes n
    WHERE (
      $1::text IS NULL
      OR n.title ILIKE ('%' || $1 || '%')
      OR n.topic ILIKE ('%' || $1 || '%')
      OR n.content ILIKE ('%' || $1 || '%')
    )
    ORDER BY n.updated_at DESC
    LIMIT $2
    `,
    [search || null, limit]
  );

  return rows.map((row: any) => mapNote(row));
}

export async function updateNote(
  id: string,
  patch: {
    title?: string;
    topic?: string;
    content?: string;
    provider?: string | null;
    model?: string | null;
    status?: string;
    error?: string | null;
    materials?: Material[];
  }
): Promise<Note | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let index = 1;

  values.push(id);
  index += 1;

  const add = (column: string, value: any) => {
    fields.push(`${column}=$${index}`);
    values.push(value);
    index += 1;
  };

  if (patch.title !== undefined) add("title", patch.title);
  if (patch.topic !== undefined) add("topic", patch.topic);
  if (patch.content !== undefined) add("content", patch.content);
  if (patch.provider !== undefined) add("provider", patch.provider);
  if (patch.model !== undefined) add("model", patch.model);
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.error !== undefined) add("error", patch.error);
  if (patch.materials !== undefined)
    add("materials", JSON.stringify(patch.materials));

  if (fields.length === 0) return getNote(id);

  fields.push("updated_at=NOW()");

  await query(`UPDATE notes SET ${fields.join(", ")} WHERE id=$1`, values);

  return getNote(id);
}

export async function deleteNote(id: string) {
  await query("DELETE FROM notes WHERE id = $1", [id]);
}

export async function getNoteSources(noteId: string): Promise<Source[]> {
  const { rows } = await query(
    `
    SELECT *
    FROM note_sources
    WHERE note_id = $1
    ORDER BY ordinal ASC
    `,
    [noteId]
  );

  return rows.map(mapSource);
}

export async function replaceNoteSources(noteId: string, sources: Source[]) {
  await query("DELETE FROM note_sources WHERE note_id = $1", [noteId]);

  for (const [index, source] of sources.entries()) {
    await query(
      `
      INSERT INTO note_sources (
        id, note_id, ordinal, title, url, domain, snippet, excerpt,
        published_at, reliability
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        randomUUID(),
        noteId,
        source.ordinal || index + 1,
        source.title || null,
        source.url,
        source.domain || "",
        source.snippet || "",
        source.excerpt || null,
        source.publishedAt || null,
        source.reliability || 0,
      ]
    );
  }
}

export async function saveResearchRun(input: {
  query: string;
  provider: string;
  status: string;
  results: Source[];
  error?: string | null;
  noteId?: string | null;
}) {
  const id = randomUUID();

  await query(
    `
    INSERT INTO research_runs (
      id, "query", provider, status, results, error, note_id
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
    `,
    [
      id,
      input.query,
      input.provider,
      input.status,
      JSON.stringify(input.results),
      input.error ?? null,
      input.noteId ?? null,
    ]
  );

  return id;
}

export async function attachResearchRunNote(runId: string, noteId: string) {
  await query("UPDATE research_runs SET note_id = $2 WHERE id = $1", [
    runId,
    noteId,
  ]);
}

export async function listResearchRuns(limit = 100): Promise<ResearchRun[]> {
  const { rows } = await query(
    `
    SELECT *
    FROM research_runs
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return rows.map(mapResearchRun);
}

export async function deleteResearchRun(id: string) {
  await query("DELETE FROM research_runs WHERE id = $1", [id]);
}

export async function clearResearchRuns() {
  await query("DELETE FROM research_runs");
}

export async function getPreferences(): Promise<Preferences> {
  const { rows } = await query("SELECT data FROM preferences WHERE id = 1");

  const raw = rows[0]?.data;
  const parsed = parseJson(raw, {});

  return {
    ...DEFAULT_PREFERENCES,
    ...parsed,
    settings: {
      ...DEFAULT_PREFERENCES.settings,
      ...(parsed.settings || {}),
    },
    providerPriority:
      parsed.providerPriority || DEFAULT_PREFERENCES.providerPriority,
  };
}

export async function savePreferences(data: Preferences) {
  await query(
    `
    INSERT INTO preferences (id, data, updated_at)
    VALUES (1, $1::jsonb, NOW())
    ON CONFLICT (id)
    DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [JSON.stringify(data)]
  );

  return getPreferences();
}
