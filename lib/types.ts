export type ProviderName = "groq" | "gemini" | "kilo";

export type ThemePreference = "light" | "dark" | "system";

export interface Material {
  name: string;
  text: string;
  truncated?: boolean;
}

export interface Source {
  ordinal: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  excerpt?: string;
  publishedAt?: string;
  reliability: number;
}

export interface GenerationSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  maxSources?: number;
  depth?: "brief" | "standard" | "thorough";
}

export interface Preferences {
  theme: ThemePreference;
  settings: GenerationSettings;
  providerPriority?: ProviderName[];
}

export interface Note {
  id: string;
  title: string;
  topic: string;
  content: string;
  provider?: string | null;
  model?: string | null;
  status: string;
  error?: string | null;
  materials: Material[];
  createdAt: string;
  updatedAt: string;
  sourceCount?: number;
  sources?: Source[];
}

export interface ResearchRun {
  id: string;
  query: string;
  provider: string;
  status: string;
  results: Source[];
  error?: string | null;
  noteId?: string | null;
  createdAt: string;
}

export interface ResearchResult {
  ok: boolean;
  provider: string;
  query: string;
  sources: Source[];
  warnings: string[];
  answer?: string;
  runId?: string;
}

export interface ProviderStatus {
  name: ProviderName;
  label: string;
  enabled: boolean;
  hasKey: boolean;
  baseUrl: string;
  chatUrl: string;
  model: string;
  modelAvailable:
    | "available"
    | "unavailable"
    | "unknown"
    | "error"
    | "not_checked";
  message?: string;
  lastCheck?: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  settings: {
    temperature: 0.2,
    maxTokens: 1800,
    topP: 0.9,
    maxSources: 5,
    depth: "standard",
  },
  providerPriority: ["groq", "gemini", "kilo"],
};
