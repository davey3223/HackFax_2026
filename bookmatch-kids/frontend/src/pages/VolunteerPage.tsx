import { useEffect, useState } from "react";
import { fetchPicklist, listRequests, textToSpeech, updateRequestStatus } from "../api";
import type { Picklist, RequestItem } from "../types";

export default function VolunteerPage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [active, setActive] = useState<RequestItem | null>(null);
  const [picklist, setPicklist] = useState<Picklist | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const data = await listRequests("approved");
      setRequests(data);
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
  }, []);

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

  async function handleQuickStatus(status: string) {
    if (!active) return;
    setLoading(true);
    setError(null);
    setQuickMessage(null);
    try {
      const updated = await updateRequestStatus(active.id, status);
      setActive(updated);
      setQuickMessage(`Marked as ${status}.`);
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

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

  function handlePrint() {
    window.print();
  }

  return (
    <section className="panel">
      <h2>Volunteer Picklists</h2>
      {active ? (
        <div className="panel-sub">
          <h3>Quick Task</h3>
          <p className="muted">Next approved request:</p>
          <p><strong>{active.raw_text}</strong></p>
          <div className="field-row">
            <button onClick={() => handleQuickStatus("picked")} disabled={loading}>
              Mark picked
            </button>
            <button className="secondary" onClick={() => handleQuickStatus("packed")} disabled={loading}>
              Mark packed
            </button>
          </div>
          {quickMessage ? <div className="success">{quickMessage}</div> : null}
        </div>
      ) : null}
      <div className="field-row">
        <button className="secondary" onClick={loadRequests} disabled={loading}>
          Refresh
        </button>
        <span className="muted">Showing approved requests only.</span>
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
            <p className="muted">No approved requests yet.</p>
          ) : null}
        </aside>

        <div className="detail">
          {active ? (
            <div>
              <h3>Picklist</h3>
              <p><strong>Request:</strong> {active.raw_text}</p>
              <div className="field-row">
                <button onClick={() => handlePicklist(active.id)} disabled={loading}>
                  Load picklist
                </button>
                <button className="secondary" onClick={handleReadPicklist} disabled={reading || !picklist}>
                  {reading ? "Reading..." : "Read picklist"}
                </button>
                <button className="secondary" onClick={handleExportCsv} disabled={!picklist}>
                  Export CSV
                </button>
                <button className="secondary" onClick={handlePrint} disabled={!picklist}>
                  Print
                </button>
              </div>

              {picklist ? (
                <div className="picklist">
                  <p><strong>Location:</strong> {picklist.location_id}</p>
                  <ul>
                    {picklist.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="muted">Load a picklist to view items.</p>
              )}
            </div>
          ) : (
            <p className="muted">Select a request to view picklist.</p>
          )}
        </div>
      </div>
    </section>
  );
}
