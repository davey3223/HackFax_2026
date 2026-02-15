import type {
  ParsedPreferences,
  Book,
  RequestItem,
  Picklist,
  BookMatch,
  ConfigStatus,
  ConciergeReply,
  KeysStatus,
  ChatResponse,
  GeminiModelsResponse,
  InventoryImportResult,
  AnalyticsResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function getGeminiModel(): string {
  try {
    return localStorage.getItem("bookmatch_gemini_model") || "";
  } catch {
    return "";
  }
}

function getAuthToken(): string {
  try {
    return localStorage.getItem("bookmatch_token") || "";
  } catch {
    return "";
  }
}

function friendlyMessage(message: string): string {
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("Invalid credentials")) return "Email or password didn’t match.";
  if (message.includes("Login required")) return "Please sign in to continue.";
  if (message.includes("Staff access required")) return "Staff access required. Please sign in.";
  if (message.includes("Invalid staff invite code")) return "That staff invite code didn’t work.";
  if (message.includes("Demo login disabled")) return "Demo login is disabled. Ask an organizer to enable it.";
  return message;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let text = "";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") {
        text = data.detail;
      } else {
        text = JSON.stringify(data);
      }
    } catch {
      text = await res.text();
    }
    throw new Error(friendlyMessage(text || `Request failed: ${res.status}`));
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

export function chatBooks(payload: {
  text: string;
  age?: number | null;
  language?: string | null;
  format?: string | null;
}): Promise<ChatResponse> {
  return request("/api/chat", {
    method: "POST",
    body: JSON.stringify({ ...payload, model: getGeminiModel() || undefined }),
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

export function fetchKeysStatus(): Promise<KeysStatus> {
  return request("/api/admin/keys-status");
}

export function login(payload: { email: string; password: string }): Promise<{ token: string; user: { id: string; email: string; name: string; role: string } }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function register(payload: { name: string; email: string; password: string; role?: string; invite_code?: string }): Promise<{ token: string; user: { id: string; email: string; name: string; role: string } }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function demoLogin(): Promise<{ token: string; user: { id: string; email: string; name: string; role: string } }> {
  return request("/api/auth/demo", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function me(): Promise<{ id: string; email: string; name: string; role: string }> {
  return request("/api/auth/me");
}

export function magicLogin(token: string): Promise<{ token: string; user: { id: string; email: string; name: string; role: string } }> {
  return request("/api/auth/magic-login", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function createMagicLink(): Promise<{ url: string }> {
  return request("/api/auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ role: "volunteer" }),
  });
}

export function getMyRecommendations(): Promise<{ books: Book[] }> {
  return request("/api/users/me/recommendations");
}

export function seedDemoRequests(): Promise<{ ok: boolean; created: number }> {
  return request("/api/admin/demo-seed", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function geminiTest(): Promise<{ reply: string }> {
  const model = getGeminiModel();
  const query = model ? `?model=${encodeURIComponent(model)}` : "";
  return request(`/api/admin/gemini-test${query}`);
}

export function fetchGeminiModels(): Promise<GeminiModelsResponse> {
  return request("/api/admin/gemini-models");
}

export function lookupBooks(bookIds: string[]): Promise<{ books: Book[] }> {
  return request("/api/admin/books/lookup", {
    method: "POST",
    body: JSON.stringify({ book_ids: bookIds }),
  });
}

export function searchAdminBooks(query: string): Promise<{ books: Book[] }> {
  const qs = new URLSearchParams({ q: query });
  return request(`/api/admin/books/search?${qs.toString()}`);
}

export function importInventory(payload: {
  csv: string;
  location_id?: string;
  default_qty?: number;
}): Promise<InventoryImportResult> {
  return request("/api/admin/inventory/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateInventory(payload: {
  book_id: string;
  location_id: string;
  qty_available: number;
}): Promise<{ ok: boolean }> {
  return request("/api/admin/inventory/update", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAnalytics(): Promise<AnalyticsResponse> {
  return request("/api/admin/analytics");
}

export function setMongoUri(mongodb_uri: string): Promise<{ ok: boolean; path?: string }> {
  return request("/api/admin/set-mongodb-uri", {
    method: "POST",
    body: JSON.stringify({ mongodb_uri }),
  });
}

export function fetchBookSummary(bookId: string): Promise<{ summary: string }> {
  return request("/api/books/summary", {
    method: "POST",
    body: JSON.stringify({ book_id: bookId, model: getGeminiModel() || undefined }),
  });
}

export function concierge(message: string, history: string[] = []): Promise<ConciergeReply> {
  return request("/api/gemini/concierge", {
    method: "POST",
    body: JSON.stringify({ message, history, model: getGeminiModel() || undefined }),
  });
}

export async function textToSpeech(text: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `TTS failed: ${res.status}`);
  }
  return res.blob();
}
