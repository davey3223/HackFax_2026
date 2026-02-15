import { useEffect, useState } from "react";
import { fetchPicklist, fetchConfigStatus, listRequests, updateRequestStatus } from "../api";
import type { Picklist, RequestItem, ConfigStatus } from "../types";

const STATUS_OPTIONS = ["new", "approved", "picked", "packed", "distributed"];

export default function StaffPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [active, setActive] = useState<RequestItem | null>(null);
  const [picklist, setPicklist] = useState<Picklist | null>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const data = await listRequests(statusFilter || undefined);
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
  }, [statusFilter]);

  useEffect(() => {
    fetchConfigStatus()
      .then(setConfig)
      .catch(() => setConfig(null));
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
