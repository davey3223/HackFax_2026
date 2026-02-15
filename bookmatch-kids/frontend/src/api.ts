import type { ParsedPreferences, Book, RequestItem, Picklist, BookMatch, ConfigStatus } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json();
}

export function parsePreferences(payload: {
  text: string;
  age?: number | null;
  language?: string | null;
  format?: string | null;
}): Promise<ParsedPreferences> {
  return request("/api/parse", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function searchBooks(params: {
  age?: number | null;
  language?: string | null;
  tags?: string[];
  format?: string | null;
  q?: string | null;
}): Promise<Book[]> {
  const query = new URLSearchParams();
  if (params.age) query.set("age", String(params.age));
  if (params.language) query.set("language", params.language);
  if (params.format) query.set("format", params.format);
  if (params.q) query.set("q", params.q);
  if (params.tags && params.tags.length > 0) query.set("tags", params.tags.join(","));

  return request(`/api/books/search?${query.toString()}`);
}

export function createRequest(payload: {
  raw_text: string;
  parsed_preferences: ParsedPreferences;
  matched: BookMatch[];
  location_id?: string | null;
}): Promise<RequestItem> {
  return request("/api/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listRequests(status?: string): Promise<RequestItem[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/api/admin/requests${query}`);
}

export function updateRequestStatus(id: string, status: string): Promise<RequestItem> {
  return request(`/api/admin/requests/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export function fetchPicklist(id: string): Promise<Picklist> {
  return request(`/api/admin/requests/${id}/picklist`);
}

export function fetchConfigStatus(): Promise<ConfigStatus> {
  return request("/api/admin/config-status");
}
