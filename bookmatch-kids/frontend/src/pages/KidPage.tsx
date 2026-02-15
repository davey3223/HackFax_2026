import { useState } from "react";
import { createRequest, parsePreferences, searchBooks } from "../api";
import type { Book, ParsedPreferences } from "../types";

const FORMAT_OPTIONS = ["any", "picture", "chapter", "graphic"];
const LANGUAGE_OPTIONS = ["English", "Spanish", "Bilingual"];

export default function KidPage() {
  const [text, setText] = useState("");
  const [age, setAge] = useState("");
  const [language, setLanguage] = useState("");
  const [format, setFormat] = useState("any");
  const [results, setResults] = useState<Book[]>([]);
  const [parsed, setParsed] = useState<ParsedPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [readToMe, setReadToMe] = useState(false);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const parsedPrefs = await parsePreferences({
        text,
        age: age ? Number(age) : undefined,
        language: language || undefined,
        format: format !== "any" ? format : undefined,
      });
      setParsed(parsedPrefs);

      const books = await searchBooks({
        age: parsedPrefs.age ?? (age ? Number(age) : undefined),
        language: parsedPrefs.language ?? (language || undefined),
        format: parsedPrefs.format ?? (format !== "any" ? format : undefined),
        tags: parsedPrefs.tags || [],
        q: text,
      });
      setResults(books);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequest() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        raw_text: text,
        parsed_preferences: parsed || {},
        matched: results.map((book) => ({
          book_id: book.id,
          score: book.score ?? 0,
        })),
      };
      await createRequest(payload);
      setMessage("Request sent to staff. Thanks!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>Find a Book</h2>
      <label className="field">
        <span>Describe the book you want</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="I want a funny animal book about space for a 7 year old"
          rows={4}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Age (optional)</span>
          <input
            type="number"
            min={3}
            max={12}
            value={age}
            onChange={(event) => setAge(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Language</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="">Any</option>
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Format</span>
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            {FORMAT_OPTIONS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={readToMe}
            onChange={(event) => setReadToMe(event.target.checked)}
          />
          <span>Read to me (ElevenLabs placeholder)</span>
        </label>
        {readToMe ? <span className="hint">Audio preview coming soon.</span> : null}
      </div>
      <div className="actions">
        <button onClick={handleSearch} disabled={loading || !text.trim()}>
          {loading ? "Searching..." : "Find books"}
        </button>
        <button
          className="secondary"
          onClick={handleRequest}
          disabled={loading || results.length === 0}
        >
          Request these
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="success">{message}</div> : null}

      <div className="results">
        {results.map((book) => (
          <article key={book.id} className="card">
            <div>
              <h3>{book.title}</h3>
              <p className="muted">{book.author}</p>
              <p>{book.description}</p>
            </div>
            <div className="meta">
              <span>Age {book.age_min}-{book.age_max}</span>
              <span>{book.format}</span>
              <span>{book.language}</span>
            </div>
          </article>
        ))}
        {!loading && results.length === 0 ? (
          <p className="muted">No results yet. Try searching for a book!</p>
        ) : null}
      </div>
    </section>
  );
}
