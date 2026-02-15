import { useEffect, useState } from "react";
import {
  fetchPicklist,
  fetchConfigStatus,
  fetchKeysStatus,
  listRequests,
  updateRequestStatus,
  textToSpeech,
  geminiTest,
  fetchGeminiModels,
  lookupBooks,
  importInventory,
  updateInventory,
  fetchAnalytics,
  setMongoUri,
  searchAdminBooks,
  createMagicLink,
  seedDemoRequests,
  fetchDbInfo,
  refreshBookCovers,
} from "../api";
import type {
  Picklist,
  RequestItem,
  ConfigStatus,
  KeysStatus,
  Book,
  AnalyticsResponse,
  InventoryImportResult,
  DbInfo,
} from "../types";

const STATUS_OPTIONS = ["new", "approved", "picked", "packed", "distributed"];

export default function StaffPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [active, setActive] = useState<RequestItem | null>(null);
  const [picklist, setPicklist] = useState<Picklist | null>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [keys, setKeys] = useState<KeysStatus | null>(null);
  const [reading, setReading] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<string | null>(null);
  const [geminiModel, setGeminiModel] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [matchedBooks, setMatchedBooks] = useState<Book[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [importResult, setImportResult] = useState<InventoryImportResult | null>(null);
  const [inventoryCsv, setInventoryCsv] = useState("");
  const [inventoryLocation, setInventoryLocation] = useState("main");
  const [inventoryQty, setInventoryQty] = useState("1");
  const [updatingInventory, setUpdatingInventory] = useState<Record<string, string>>({});
  const [inventoryLocationOverrides, setInventoryLocationOverrides] = useState<Record<string, string>>({});
  const [mongoUri, setMongoUriInput] = useState("");
  const [mongoResult, setMongoResult] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Book[]>([]);
  const [magicUrl, setMagicUrl] = useState<string | null>(null);
  const [magicError, setMagicError] = useState<string | null>(null);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [coverLimit, setCoverLimit] = useState("25");
  const [coverForce, setCoverForce] = useState(false);
  const [coverResult, setCoverResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const data = await listRequests(statusFilter || undefined);
      setRequests(data);
      try {
        const analyticsData = await fetchAnalytics();
        setAnalytics(analyticsData);
      } catch {
        setAnalytics(null);
      }
      if (data.length > 0) {
        setActive(data[0]);
      } else {
        setActive(null);
        setPicklist(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  useEffect(() => {
    fetchConfigStatus()
      .then(setConfig)
      .catch(() => setConfig(null));
    fetchKeysStatus()
      .then(setKeys)
      .catch(() => setKeys(null));
    fetchDbInfo()
      .then(setDbInfo)
      .catch(() => setDbInfo(null));
    fetchAnalytics()
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
    let storedModel = "";
    try {
      storedModel = localStorage.getItem("bookmatch_gemini_model") || "";
      setGeminiModel(storedModel);
    } catch {
      setGeminiModel("");
    }
    fetchGeminiModels()
      .then((data) => {
        if (data && data.models) {
          const names = data.models
            .map((m) => (m.name || "").replace("models/", ""))
            .filter(Boolean);
          setModelOptions(names);
          if (names.length > 0 && storedModel && !names.includes(storedModel)) {
            handleModelChange("");
          }
        }
      })
      .catch(() => setModelOptions([]));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchAnalytics()
        .then(setAnalytics)
        .catch(() => setAnalytics(null));
      fetchDbInfo()
        .then(setDbInfo)
        .catch(() => setDbInfo(null));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  async function handleStatusChange(newStatus: string) {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await updateRequestStatus(active.id, newStatus);
      setActive(updated);
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handlePicklist(requestId: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPicklist(requestId);
      setPicklist(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function loadMatchedBooks(request: RequestItem | null) {
    if (!request || !request.matched || request.matched.length === 0) {
      setMatchedBooks([]);
      return;
    }
    try {
      const ids = request.matched.map((m) => m.book_id);
      const data = await lookupBooks(ids);
      setMatchedBooks(data.books || []);
    } catch {
      setMatchedBooks([]);
    }
  }

  useEffect(() => {
    loadMatchedBooks(active);
  }, [active]);

  async function handleReadPicklist() {
    if (!picklist) return;
    setReading(true);
    setError(null);
    try {
      const text = `Picklist for location ${picklist.location_id}. ${picklist.lines.join(" ")}`;
      const blob = await textToSpeech(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "TTS failed");
    } finally {
      setReading(false);
    }
  }

  function handleExportCsv() {
    if (!picklist) return;
    const rows = [
      ["request_id", picklist.request_id],
      ["location_id", picklist.location_id],
      ["item"],
      ...picklist.lines.map((line) => [line]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `picklist-${picklist.request_id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleGeminiTest() {
    setGeminiTestResult(null);
    setError(null);
    try {
      const data = await geminiTest();
      setGeminiTestResult(data.reply || "OK");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini test failed");
    }
  }

  function handleModelChange(value: string) {
    setGeminiModel(value);
    try {
      if (value) {
        localStorage.setItem("bookmatch_gemini_model", value);
      } else {
        localStorage.removeItem("bookmatch_gemini_model");
      }
    } catch {
      // ignore
    }
  }

  async function handleImportCsv() {
    setLoading(true);
    setError(null);
    setImportResult(null);
    try {
      const qty = Number(inventoryQty || "1");
      const result = await importInventory({
        csv: inventoryCsv,
        location_id: inventoryLocation || "main",
        default_qty: Number.isFinite(qty) ? qty : 1,
      });
      setImportResult(result);
      setInventoryCsv("");
      await loadRequests();
      const data = await fetchAnalytics();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveMongoUri() {
    if (!mongoUri.trim()) return;
    setLoading(true);
    setError(null);
    setMongoResult(null);
    try {
      const result = await setMongoUri(mongoUri.trim());
      setMongoResult(`Saved to ${result.path || ".env"}.`);
      const data = await fetchAnalytics();
      setAnalytics(data);
      const keyStatus = await fetchKeysStatus();
      setKeys(keyStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadTemplate() {
    const headers = [
      "title",
      "author",
      "description",
      "tags",
      "age_min",
      "age_max",
      "reading_level",
      "language",
      "format",
      "cover_url",
      "isbn",
      "qty_available",
      "location_id",
    ];
    const csv = `${headers.join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSearchInventory() {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchAdminBooks(searchQuery.trim());
      setSearchResults(data.books || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateMagicLink() {
    setMagicError(null);
    try {
      const data = await createMagicLink();
      setMagicUrl(data.url);
    } catch (err) {
      setMagicError(err instanceof Error ? err.message : "Magic link failed");
    }
  }

  async function handleSeedDemo() {
    setSeedMessage(null);
    setError(null);
    try {
      const result = await seedDemoRequests();
      setSeedMessage(`Created ${result.created} demo requests.`);
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    }
  }

  async function handleInventoryUpdate(bookId: string, locationId: string) {
    const key = `${bookId}:${locationId}`;
    const value = updatingInventory[key];
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      await updateInventory({
        book_id: bookId,
        location_id: locationId,
        qty_available: Number(value),
      });
      await loadRequests();
      const data = await fetchAnalytics();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inventory update failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshCovers(all = false) {
    setCoverResult(null);
    setError(null);
    setLoading(true);
    try {
      const limit = Number(coverLimit || "25");
      const result = await refreshBookCovers({
        limit: Number.isFinite(limit) ? limit : 25,
        force: coverForce,
        all,
      });
      setCoverResult(
        `Checked ${result.checked}. Updated ${result.updated}. Skipped ${result.skipped}.`
      );
      const info = await fetchDbInfo();
      setDbInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cover refresh failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>Staff Dashboard</h2>
      {config ? (
        <div className={config.configured ? "success" : "warning"}>
          {config.configured
            ? "All API keys are configured."
            : `Missing keys: ${config.missing.join(", ")}`}
          <div className="muted">
            Run <code>setup_env.cmd</code> to update local secrets.
          </div>
        </div>
      ) : null}
      {keys ? (
        <div className="panel-sub">
          <h3>Key Status</h3>
          <div className="chips">
            <span className={keys.mongodb_configured ? "chip" : "chip danger"}>
              MongoDB: {keys.mongodb_configured ? "OK" : "Missing"}
            </span>
            <span className={keys.gemini_configured ? "chip" : "chip danger"}>
              Gemini: {keys.gemini_configured ? "OK" : "Missing"}
            </span>
            <span className={keys.elevenlabs_configured ? "chip" : "chip danger"}>
              ElevenLabs: {keys.elevenlabs_configured ? "OK" : "Missing"}
            </span>
            <span className={keys.elevenlabs_voice_configured ? "chip" : "chip danger"}>
              ElevenLabs Voice: {keys.elevenlabs_voice_configured ? "OK" : "Missing"}
            </span>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Gemini Model</span>
              <select value={geminiModel} onChange={(event) => handleModelChange(event.target.value)}>
                <option value="">Use server default</option>
                {modelOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <span className="muted">Saved locally for this browser.</span>
          </div>
          <div className="field-row">
            <button className="secondary" onClick={handleGeminiTest} disabled={loading}>
              Test Gemini
            </button>
            {geminiTestResult ? <span className="muted">Gemini says: {geminiTestResult}</span> : null}
          </div>
        </div>
      ) : null}
      {dbInfo ? (
        <div className="panel-sub">
          <h3>Database</h3>
          <div className="chips">
            <span className="chip">DB: {dbInfo.database}</span>
            <span className="chip">Books: {dbInfo.books}</span>
            <span className="chip">Inventory: {dbInfo.inventory}</span>
            <span className="chip">Requests: {dbInfo.requests}</span>
          </div>
        </div>
      ) : null}
      <div className="panel-sub">
        <h3>MongoDB Setup</h3>
        <p className="muted">Paste your MongoDB URI to save it to the server .env.</p>
        <div className="field-row">
          <input
            className="stretch"
            type="password"
            placeholder="mongodb+srv://user:password@cluster/..."
            value={mongoUri}
            onChange={(event) => setMongoUriInput(event.target.value)}
          />
          <button onClick={handleSaveMongoUri} disabled={loading || !mongoUri.trim()}>
            Save MongoDB URI
          </button>
        </div>
        {mongoResult ? <div className="success">{mongoResult}</div> : null}
      </div>
      {analytics ? (
        <div className="panel-sub">
          <h3>Analytics</h3>
          <div className="chips">
            {Object.entries(analytics.status_counts).map(([status, count]) => (
              <span key={status} className="chip">{status}: {count}</span>
            ))}
          </div>
          <div className="field-row">
            <div>
              <strong>Top tags</strong>
              <ul>
                {analytics.top_tags.map((tag) => (
                  <li key={tag.tag}>{tag.tag}: {tag.count}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong>Last 7 days</strong>
              <ul>
                {analytics.daily.map((day) => (
                  <li key={day.date}>{day.date}: {day.count}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
      <div className="panel-sub">
        <h3>Inventory Upload (CSV)</h3>
        <p className="muted">
          Columns: title, author, description, tags, age_min, age_max, reading_level, language, format, cover_url, isbn, qty_available, location_id
        </p>
        <p className="muted">
          Common headers like "book_title", "authors", "summary", "genre", "isbn13", or "quantity" are auto-mapped.
        </p>
        <div className="field-row">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setInventoryCsv(String(reader.result || ""));
              reader.readAsText(file);
            }}
          />
          <span className="muted">Or paste CSV below.</span>
        </div>
        <label className="field">
          <span>Paste CSV</span>
          <textarea
            value={inventoryCsv}
            onChange={(event) => setInventoryCsv(event.target.value)}
            rows={4}
            placeholder="title,author,tags,age_min,age_max,language,format,isbn,qty_available,location_id"
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Default location</span>
            <input value={inventoryLocation} onChange={(event) => setInventoryLocation(event.target.value)} />
          </label>
          <label className="field">
            <span>Default qty</span>
            <input
              type="number"
              min={0}
              value={inventoryQty}
              onChange={(event) => setInventoryQty(event.target.value)}
            />
          </label>
          <button onClick={handleImportCsv} disabled={loading || !inventoryCsv.trim()}>
            Import CSV
          </button>
          <button className="secondary" onClick={handleDownloadTemplate}>
            Download template
          </button>
        </div>
        {importResult ? (
          <div className="success">
            Imported. New: {importResult.inserted_books}, Updated: {importResult.updated_books}, Inventory upserts: {importResult.inventory_upserts}{importResult.skipped ? `, Skipped: ${importResult.skipped}` : ""}
          </div>
        ) : null}
      </div>
      <div className="panel-sub">
        <h3>Cover Refresh (Google Books)</h3>
        <p className="muted">
          Backfill missing book covers using Google Books. Use “Force” to refresh every book.
        </p>
        <div className="field-row">
          <label className="field">
            <span>Limit</span>
            <input
              type="number"
              min={1}
              max={200}
              value={coverLimit}
              onChange={(event) => setCoverLimit(event.target.value)}
            />
          </label>
          <label className="field inline">
            <input
              type="checkbox"
              checked={coverForce}
              onChange={(event) => setCoverForce(event.target.checked)}
            />
            <span>Force refresh</span>
          </label>
          <button className="secondary" onClick={handleRefreshCovers} disabled={loading}>
            Refresh covers
          </button>
          <button className="secondary" onClick={() => handleRefreshCovers(true)} disabled={loading}>
            Refresh all books
          </button>
          {coverResult ? <span className="muted">{coverResult}</span> : null}
        </div>
      </div>
      <div className="panel-sub">
        <h3>Volunteer QR Login</h3>
        <p className="muted">Generate a one-time volunteer link and scan it on a phone.</p>
        <div className="field-row">
          <button className="secondary" onClick={handleCreateMagicLink}>
            Generate link
          </button>
          {magicError ? <span className="muted">{magicError}</span> : null}
        </div>
        {magicUrl ? (
          <div className="field-row">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(magicUrl)}`}
              alt="Volunteer QR code"
            />
            <div>
              <p className="muted">Open link:</p>
              <code>{magicUrl}</code>
            </div>
          </div>
        ) : null}
      </div>
      <div className="panel-sub">
        <h3>Demo Data</h3>
        <p className="muted">Add a few demo requests for presentations.</p>
        <div className="field-row">
          <button className="secondary" onClick={handleSeedDemo}>
            Seed demo requests
          </button>
          {seedMessage ? <span className="muted">{seedMessage}</span> : null}
        </div>
      </div>
      <div className="panel-sub">
        <h3>Inventory Search</h3>
        <div className="field-row">
          <input
            className="stretch"
            placeholder="Search by title, author, or ISBN"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button onClick={handleSearchInventory} disabled={loading || !searchQuery.trim()}>
            Search
          </button>
        </div>
        {searchResults.length > 0 ? (
          <div className="results">
            {searchResults.map((book) => {
              const loc = inventoryLocationOverrides[book.id] || "main";
              const qtyKey = `${book.id}:${loc}`;
              const currentQty = book.inventory?.find((i) => i.location_id === loc)?.qty_available ?? 0;
              return (
                <article key={book.id} className="card">
                  <div>
                    <h4>{book.title}</h4>
                    <p className="muted">{book.author}</p>
                    <p className="muted">Current qty ({loc}): {currentQty}</p>
                    <div className="field-row">
                      <input
                        placeholder="Location"
                        value={loc}
                        onChange={(event) =>
                          setInventoryLocationOverrides((prev) => ({
                            ...prev,
                            [book.id]: event.target.value,
                          }))
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Qty"
                        value={updatingInventory[qtyKey] || ""}
                        onChange={(event) =>
                          setUpdatingInventory((prev) => ({
                            ...prev,
                            [qtyKey]: event.target.value,
                          }))
                        }
                      />
                      <button
                        className="secondary"
                        onClick={() => handleInventoryUpdate(book.id, loc)}
                        disabled={loading || !updatingInventory[qtyKey]}
                      >
                        Set Qty
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">Search to update inventory without a request.</p>
        )}
      </div>
      <div className="field-row">
        <label className="field">
          <span>Filter by status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" onClick={loadRequests} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="staff-grid">
        <aside className="list">
          {requests.map((item) => (
            <button
              key={item.id}
              className={active?.id === item.id ? "list-item active" : "list-item"}
              onClick={() => {
                setActive(item);
                setPicklist(null);
              }}
            >
              <div>
                <strong>{item.status}</strong>
                <div className="muted">{new Date(item.created_at).toLocaleString()}</div>
              </div>
              <div className="muted">{item.raw_text.slice(0, 40)}...</div>
            </button>
          ))}
          {!loading && requests.length === 0 ? (
            <p className="muted">No requests yet.</p>
          ) : null}
        </aside>

        <div className="detail">
          {active ? (
            <div>
              <h3>Request Details</h3>
              <p><strong>Status:</strong> {active.status}</p>
              <p><strong>Raw text:</strong> {active.raw_text}</p>
              <p><strong>Location:</strong> {active.location_id}</p>
              {matchedBooks.length > 0 ? (
                <div className="panel-sub">
                  <h4>Matched Books (Adjust Inventory)</h4>
              {matchedBooks.map((book) => (
                <div key={book.id} className="field-row">
                  {(() => {
                    const loc = inventoryLocationOverrides[book.id] || "main";
                    const qtyKey = `${book.id}:${loc}`;
                    return (
                      <>
                      <span className="muted">{book.title}</span>
                      <input
                        placeholder="Location"
                        value={loc}
                        onChange={(event) =>
                          setInventoryLocationOverrides((prev) => ({
                            ...prev,
                            [book.id]: event.target.value,
                          }))
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Qty"
                        value={updatingInventory[qtyKey] || ""}
                        onChange={(event) =>
                          setUpdatingInventory((prev) => ({
                            ...prev,
                            [qtyKey]: event.target.value,
                          }))
                        }
                      />
                      <button
                        className="secondary"
                        onClick={() => handleInventoryUpdate(book.id, loc)}
                        disabled={loading || !updatingInventory[qtyKey]}
                      >
                        Set Qty
                      </button>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          ) : null}

              <div className="field-row">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    className={status === active.status ? "primary" : "secondary"}
                    onClick={() => handleStatusChange(status)}
                    disabled={loading}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <div className="field-row">
                <button onClick={() => handlePicklist(active.id)} disabled={loading}>
                  View picklist
                </button>
              </div>

              {picklist ? (
                <div className="picklist">
                  <h4>Picklist</h4>
                  <p><strong>Location:</strong> {picklist.location_id}</p>
                  <button className="secondary" onClick={handleReadPicklist} disabled={reading}>
                    {reading ? "Reading..." : "Read picklist"}
                  </button>
                  <button className="secondary" onClick={handleExportCsv}>
                    Export CSV
                  </button>
                  <ul>
                    {picklist.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="muted">Select a request to view details.</p>
          )}
        </div>
      </div>
    </section>
  );
}
