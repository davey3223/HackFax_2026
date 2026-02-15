export type ParsedPreferences = {
  age?: number | null;
  language?: string | null;
  format?: string | null;
  tags?: string[];
  keywords?: string[];
  tone?: string | null;
  themes?: string[];
  series?: string | null;
  length?: string | null;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  description: string;
  tags: string[];
  age_min: number;
  age_max: number;
  reading_level: string;
  language: string;
  format: string;
  cover_url: string;
  isbn: string;
  score?: number;
  inventory?: InventoryEntry[];
};

export type InventoryEntry = {
  location_id: string;
  qty_available: number;
};

export type BookMatch = {
  book_id: string;
  score: number;
};

export type RequestItem = {
  id: string;
  created_at: string;
  raw_text: string;
  parsed_preferences: ParsedPreferences;
  matched: BookMatch[];
  location_id: string;
  status: string;
  requester_name?: string | null;
  requester_contact?: string | null;
  requester_notes?: string | null;
};

export type Picklist = {
  request_id: string;
  location_id: string;
  lines: string[];
};

export type ConfigStatus = {
  missing: string[];
  configured: boolean;
};

export type KeysStatus = {
  gemini_configured: boolean;
  elevenlabs_configured: boolean;
  elevenlabs_voice_configured: boolean;
  mongodb_configured: boolean;
};

export type ConciergeReply = {
  reply: string;
  suggested_queries: string[];
};

export type ChatResponse = {
  parsed: ParsedPreferences;
  matches: Book[];
  response?: string;
  gemini_used?: boolean;
  gemini_error?: string | null;
};

export type GeminiModel = {
  name?: string;
  displayName?: string;
};

export type GeminiModelsResponse = {
  ok: boolean;
  models: GeminiModel[];
  error?: string;
};

export type InventoryImportResult = {
  ok: boolean;
  inserted_books: number;
  updated_books: number;
  inventory_upserts: number;
  skipped?: number;
};

export type AnalyticsResponse = {
  status_counts: Record<string, number>;
  top_tags: { tag: string; count: number }[];
  daily: { date: string; count: number }[];
};

export type DbInfo = {
  database: string;
  books: number;
  inventory: number;
  requests: number;
};
