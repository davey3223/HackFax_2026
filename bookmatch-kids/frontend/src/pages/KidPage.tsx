import { useEffect, useRef, useState } from "react";
import { concierge, createRequest, fetchBookSummary, chatBooks, textToSpeech, getMyRecommendations } from "../api";
import type { Book, ParsedPreferences } from "../types";

const FORMAT_OPTIONS = ["any", "picture", "chapter", "graphic"];
const LANGUAGE_OPTIONS = ["English", "Spanish", "Bilingual"];
const TOPIC_SUGGESTIONS = ["space", "animals", "mystery", "sports", "dragons", "friendship", "adventure"];

export default function KidPage() {
  const [text, setText] = useState("");
  const [age, setAge] = useState("");
  const [language, setLanguage] = useState("");
  const [format, setFormat] = useState("any");
  const [results, setResults] = useState<Book[]>([]);
  const [parsed, setParsed] = useState<ParsedPreferences | null>(null);
  const [geminiUsed, setGeminiUsed] = useState<boolean | null>(null);
  const [geminiNotice, setGeminiNotice] = useState<string | null>(null);
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [readToMe, setReadToMe] = useState(false);
  const [conciergeInput, setConciergeInput] = useState("");
  const [conciergeReply, setConciergeReply] = useState<string | null>(null);
  const [conciergeSuggestions, setConciergeSuggestions] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [requesterName, setRequesterName] = useState("");
  const [requesterContact, setRequesterContact] = useState("");
  const [requesterNotes, setRequesterNotes] = useState("");
  const [myRecs, setMyRecs] = useState<Book[]>([]);
  const [recError, setRecError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function loadMyRecs() {
    setRecError(null);
    try {
      const data = await getMyRecommendations();
      setMyRecs(data.books || []);
    } catch (err) {
      setMyRecs([]);
      setRecError(err instanceof Error ? err.message : "Recommendations unavailable");
    }
  }

  useEffect(() => {
    loadMyRecs();
  }, []);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current
        .play()
        .catch(() => setError("Audio is ready. Tap play if it doesn’t start automatically."));
    }
  }, [audioUrl]);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await chatBooks({
        text,
        age: age ? Number(age) : undefined,
        language: language || undefined,
        format: format !== "any" ? format : undefined,
      });
      setParsed(data.parsed);
      setGeminiUsed(data.gemini_used ?? null);
      if (!data.gemini_used && data.gemini_error) {
        if (data.gemini_error.includes("429") || data.gemini_error.includes("Too Many Requests")) {
          setGeminiNotice("Gemini is busy right now. We used a quick fallback so you still get results.");
        } else {
          setGeminiNotice("Gemini is offline. We used a quick fallback so you still get results.");
        }
      } else {
        setGeminiNotice(null);
      }
      setChatResponse(data.response || null);
      setResults(data.matches || []);
      setSelectedIds((data.matches || []).map((book) => book.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function playAudio(textToRead: string) {
    setLoading(true);
    setError(null);
    try {
      const blob = await textToSpeech(textToRead);
      const url = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TTS failed");
    } finally {
      setLoading(false);
    }
  }

  const readEnabled = readToMe;

  async function handleConcierge() {
    setLoading(true);
    setError(null);
    try {
      const data = await concierge(conciergeInput, []);
      setConciergeReply(data.reply);
      setConciergeSuggestions(data.suggested_queries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Concierge failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleReadScreen() {
    const lines = [
      "BookMatch Kids",
      `Request: ${text || "No request entered yet."}`,
      ...results.map((book, index) => `${index + 1}. ${book.title} by ${book.author}. ${book.description}`),
    ];
    await playAudio(lines.join(" "));
  }

  async function handleReadBook(book: Book) {
    try {
      const summary = await fetchBookSummary(book.id);
      const textToRead = `${book.title} by ${book.author}. ${summary.summary}`;
      await playAudio(textToRead);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summary failed");
    }
  }

  async function handleRequest() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const selected = results.filter((book) => selectedIds.includes(book.id));
      const payload = {
        raw_text: text,
        parsed_preferences: parsed || {},
        matched: selected.map((book) => ({
          book_id: book.id,
          score: book.score ?? 0,
        })),
        requester_name: requesterName || undefined,
        requester_contact: requesterContact || undefined,
        requester_notes: requesterNotes || undefined,
      };
      await createRequest(payload);
      setMessage("Request sent to staff. Thanks!");
      setRequesterNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelection(bookId: string) {
    setSelectedIds((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
  }

  function selectAll() {
    setSelectedIds(results.map((book) => book.id));
  }

  function clearAll() {
    setSelectedIds([]);
  }

  function coverLabel(book: Book) {
    const words = (book.title || "").split(" ").filter(Boolean);
    return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "BK";
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
      <div className="suggestions">
        {TOPIC_SUGGESTIONS.map((topic) => (
          <button
            key={topic}
            className="chip"
            onClick={() => setText((prev) => (prev ? `${prev} ${topic}` : topic))}
          >
            {topic}
          </button>
        ))}
      </div>
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
          <span>Read to me (ElevenLabs)</span>
        </label>
        {readToMe ? <span className="hint">Audio is enabled.</span> : null}
      </div>
      <div className="actions">
        <button onClick={handleSearch} disabled={loading || !text.trim()}>
          {loading ? "Searching..." : "Find books"}
        </button>
        <button
          className="secondary"
          onClick={handleRequest}
          disabled={loading || selectedIds.length === 0}
        >
          Request selected
        </button>
        <button className="secondary" onClick={handleReadScreen} disabled={loading || !readToMe}>
          Read screen
        </button>
      </div>
      <div className="panel-sub">
        <h3>Submit Your Request</h3>
        <p className="muted">
          Tip: Add your contact info so we can confirm pickup details.
        </p>
        <div className="field-row">
          <label className="field">
            <span>Your name</span>
            <input value={requesterName} onChange={(event) => setRequesterName(event.target.value)} />
          </label>
          <label className="field">
            <span>Contact info (email or phone)</span>
            <input value={requesterContact} onChange={(event) => setRequesterContact(event.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Pickup notes (school, location, or special requests)</span>
          <textarea
            rows={2}
            value={requesterNotes}
            onChange={(event) => setRequesterNotes(event.target.value)}
          />
        </label>
        <p className="muted">We only use this to fulfill your book request.</p>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="success">{message}</div> : null}
      {audioUrl ? (
        <div className="panel-sub">
          <h3>Audio Player</h3>
          <audio ref={audioRef} controls src={audioUrl} />
        </div>
      ) : null}

      {parsed ? (
        <div className="panel-sub">
          <h3>We’re looking for…</h3>
          {geminiUsed !== null ? (
            <div className="field-row">
              <span className={geminiUsed ? "badge ok" : "badge warn"}>
                {geminiUsed ? "Gemini online" : "Gemini offline (fallback)"}
              </span>
              {geminiNotice ? <span className="muted">{geminiNotice}</span> : null}
            </div>
          ) : null}
          <div className="chips">
            {parsed.age ? <span className="chip">Age {parsed.age}</span> : null}
            {parsed.language ? <span className="chip">{parsed.language}</span> : null}
            {parsed.format ? <span className="chip">{parsed.format}</span> : null}
            {parsed.tone ? <span className="chip">Tone: {parsed.tone}</span> : null}
            {parsed.length ? <span className="chip">Length: {parsed.length}</span> : null}
            {parsed.series ? <span className="chip">Series: {parsed.series}</span> : null}
            {(parsed.tags || []).map((tag) => (
              <span key={tag} className="chip">#{tag}</span>
            ))}
            {(parsed.themes || []).map((theme) => (
              <span key={theme} className="chip">Theme: {theme}</span>
            ))}
            {(parsed.keywords || []).map((kw) => (
              <span key={kw} className="chip">“{kw}”</span>
            ))}
          </div>
        </div>
      ) : null}
      {chatResponse ? (
        <div className="panel-sub">
          <h3>Gemini says</h3>
          <p>{chatResponse}</p>
        </div>
      ) : null}

      <div className="panel-sub">
        <h3>Ask the Book Concierge (Gemini)</h3>
        <div className="field-row">
          <input
            className="stretch"
            type="text"
            placeholder="Ask for recommendations..."
            value={conciergeInput}
            onChange={(event) => setConciergeInput(event.target.value)}
          />
          <button onClick={handleConcierge} disabled={loading || !conciergeInput.trim()}>
            Ask
          </button>
        </div>
        {conciergeReply ? <p>{conciergeReply}</p> : null}
        {conciergeSuggestions.length > 0 ? (
          <div className="suggestions">
            {conciergeSuggestions.map((item) => (
              <button key={item} className="chip" onClick={() => setText(item)}>
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {results.length > 0 ? (
        <div className="field-row">
          <button className="secondary" onClick={selectAll} disabled={loading}>
            Select all
          </button>
          <button className="secondary" onClick={clearAll} disabled={loading}>
            Clear selection
          </button>
          <span className="muted">{selectedIds.length} selected</span>
        </div>
      ) : null}

      <div className="results">
        {results.map((book) => (
          <article key={book.id} className="card">
            <div className="cover">
              {book.cover_url ? (
                <img src={book.cover_url} alt={`${book.title} cover`} />
              ) : (
                <img src="/cover-placeholder.svg" alt="Book cover placeholder" />
              )}
            </div>
            <div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(book.id)}
                  onChange={() => toggleSelection(book.id)}
                />
                <span>Select this book</span>
              </label>
              <h3>{book.title}</h3>
              <p className="muted">{book.author}</p>
              <p>{book.description}</p>
              <div className="field-row">
                <button className="secondary" onClick={() => handleReadBook(book)} disabled={!readEnabled || loading}>
                  Read this book
                </button>
              </div>
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

      <div className="panel-sub">
        <h3>My Recommendations</h3>
        <div className="field-row">
          <button className="secondary" onClick={loadMyRecs}>
            Refresh
          </button>
          {recError ? <span className="muted">{recError}</span> : null}
        </div>
        {myRecs.length > 0 ? (
          <div className="results">
            {myRecs.map((book) => (
              <article key={book.id} className="card">
                <div className="cover">
                  {book.cover_url ? (
                    <img src={book.cover_url} alt={`${book.title} cover`} />
                  ) : (
                    <img src="/cover-placeholder.svg" alt="Book cover placeholder" />
                  )}
                </div>
                <div>
                  <h3>{book.title}</h3>
                  <p className="muted">{book.author}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">Login to see your latest recommendations.</p>
        )}
      </div>
    </section>
  );
}
