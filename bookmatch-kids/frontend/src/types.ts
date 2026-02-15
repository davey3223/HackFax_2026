export type ParsedPreferences = {
  age?: number | null;
  language?: string | null;
  format?: string | null;
  tags?: string[];
  keywords?: string[];
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
