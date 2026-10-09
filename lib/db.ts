import { db } from "@vercel/postgres";

type Row = Record<string, any>;

const statements = [
  `
  CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    provider TEXT,
    model TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    error TEXT,
    materials JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS note_sources (
    id UUID PRIMARY KEY,
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    title TEXT,
    url TEXT NOT NULL,
    domain TEXT,
    snippet TEXT,
    excerpt TEXT,
    published_at TEXT,
    reliability INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT note_sources_note_id_ordinal_key UNIQUE (note_id, ordinal)
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS note_sources_note_id_idx
  ON note_sources(note_id)
  `,

  `
  CREATE TABLE IF NOT EXISTS research_runs (
    id UUID PRIMARY KEY,
    "query" TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    results JSONB NOT NULL DEFAULT '[]'::jsonb,
    error TEXT,
    note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT preferences_single_row CHECK (id = 1)
  )
  `,

  `
  INSERT INTO preferences (id, data)
  VALUES (1, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING
  `,
];

let schemaPromise: Promise<void> | null = null;

async function createSchema() {
  if (
    !process.env.POSTGRES_URL &&
    !process.env.POSTGRES_PRISMA_URL &&
    !process.env.POSTGRES_URL_NON_POOLING
  ) {
    throw new Error(
      "Database is not configured. Set POSTGRES_URL (Vercel Postgres / Neon)."
    );
  }

  for (const statement of statements) {
    await db.query(statement);
  }
}

export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = createSchema().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }

  return schemaPromise;
}

export async function query(text: string, params: any[] = []) {
  await ensureSchema();
  return db.query<Row>(text, params);
}
