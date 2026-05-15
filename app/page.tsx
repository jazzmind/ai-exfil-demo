"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ExfilEvent = {
  id: string;
  timestamp: string;
  params: Record<string, string>;
  userAgent?: string;
  ip?: string;
  rawUrl: string;
  path: string;
};

const POLL_INTERVAL_MS = 1500;
const FRESH_WINDOW_MS = 6000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function Dashboard() {
  const [events, setEvents] = useState<ExfilEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const freshIds = useRef<Map<string, number>>(new Map());
  const [, force] = useState(0);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const incoming: ExfilEvent[] = data.events ?? [];

      // Mark newly-seen events as fresh
      const now = Date.now();
      for (const ev of incoming) {
        if (!seenIds.current.has(ev.id)) {
          seenIds.current.add(ev.id);
          freshIds.current.set(ev.id, now);
        }
      }

      setEvents(incoming);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load + poll
  useEffect(() => {
    void fetchEvents();
    const id = setInterval(() => void fetchEvents(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchEvents]);

  // Re-render every second so fresh-window expiry visually clears
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleReset = async () => {
    if (
      !window.confirm("Clear all captured events? This cannot be undone.")
    ) {
      return;
    }
    setResetting(true);
    try {
      await fetch("/api/reset", { method: "POST" });
      seenIds.current.clear();
      freshIds.current.clear();
      await fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  // Computed each render (no memo) so that the per-second tick re-renders
  // can clear the alarm state once all fresh-windows have expired.
  const now = Date.now();
  let hasFreshEvent = false;
  for (const t of freshIds.current.values()) {
    if (now - t < FRESH_WINDOW_MS) {
      hasFreshEvent = true;
      break;
    }
  }

  return (
    <>
      <header className="header">
        <div>
          <div className="brand-eyebrow">
            Plymouth Rock · AI Risk Demonstration · Scene 1
          </div>
          <h1 className="brand-title">
            Exfiltration <span className="brand-title-accent">Monitor</span>
          </h1>
        </div>
        <div className="status-cluster">
          <div className="status-item">
            <span className="status-label">Status</span>
            <span className="live-indicator">
              <span
                className={`live-dot${hasFreshEvent ? " alarm" : ""}`}
                aria-hidden
              />
              <span className="live-text status-value">
                {hasFreshEvent ? "CAPTURE" : "MONITORING"}
              </span>
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Captures</span>
            <span className="status-value">
              {String(events.length).padStart(3, "0")}
            </span>
          </div>
          <button
            type="button"
            className="reset-button"
            onClick={handleReset}
            disabled={resetting || events.length === 0}
          >
            {resetting ? "Clearing…" : "Reset"}
          </button>
        </div>
      </header>

      <main>
        {error && (
          <div
            style={{
              padding: 24,
              border: "1px solid var(--alarm)",
              color: "var(--alarm)",
              fontFamily: "var(--mono)",
              marginBottom: 32,
            }}
          >
            ERROR · {error}
            <div
              style={{
                marginTop: 8,
                color: "var(--text-muted)",
                fontSize: 11,
              }}
            >
              Check that KV_REST_API_URL and KV_REST_API_TOKEN are set in your
              environment. See README.
            </div>
          </div>
        )}

        {!isLoading && events.length === 0 && !error && (
          <EmptyState />
        )}

        {events.length > 0 && (
          <>
            <div className="events-meta">
              <span className="events-meta-title">
                Captured transmissions
              </span>
              <span className="events-meta-count">
                / {events.length} event{events.length === 1 ? "" : "s"} ·
                most recent first
              </span>
            </div>
            {events.map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                isFresh={
                  freshIds.current.has(ev.id) &&
                  Date.now() - (freshIds.current.get(ev.id) ?? 0) <
                    FRESH_WINDOW_MS
                }
              />
            ))}
          </>
        )}
      </main>

      <footer className="footer">
        Plymouth Rock · Internal AI Risk Demonstration · Synthetic Data Only
      </footer>
    </>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-headline">Standby</div>
      <div className="empty-subhead">Awaiting transmission</div>
      <div className="empty-helper">
        This monitor displays any data sent to{" "}
        <code>/api/verify</code> on this domain. When the prepared
        vendor PDF is processed by an AI assistant in the demo, the assistant
        will fetch that endpoint with the customer's claim details attached as
        query parameters — and those details will appear here in real time.
      </div>
    </div>
  );
}

function EventCard({
  event,
  isFresh,
}: {
  event: ExfilEvent;
  isFresh: boolean;
}) {
  const paramEntries = Object.entries(event.params);

  return (
    <div className={`event-card${isFresh ? " fresh" : ""}`}>
      <div className="event-card-header">
        <div className="event-header-left">
          <div className="event-meta-item">
            <span className="event-meta-label">Time</span>
            <span className="event-meta-value">
              {formatTime(event.timestamp)}
            </span>
            <span
              className="event-meta-value"
              style={{ color: "var(--text-muted)" }}
            >
              · {formatDate(event.timestamp)}
            </span>
          </div>
          {event.ip && (
            <div className="event-meta-item">
              <span className="event-meta-label">Source</span>
              <span className="event-meta-value">{event.ip}</span>
            </div>
          )}
          <div className="event-meta-item">
            <span className="event-meta-label">Path</span>
            <span className="event-meta-value">{event.path}</span>
          </div>
        </div>
        {isFresh && <span className="new-badge">New</span>}
      </div>

      <div className="params-section">
        <div className="params-eyebrow">
          Exfiltrated Parameters · {paramEntries.length} field
          {paramEntries.length === 1 ? "" : "s"}
        </div>
        {paramEntries.length === 0 ? (
          <div className="param-value empty">
            No parameters in this request
          </div>
        ) : (
          <div className="param-grid">
            {paramEntries.map(([key, value]) => (
              <ParamRow key={key} k={key} v={value} />
            ))}
          </div>
        )}
      </div>

      <details className="raw-section">
        <summary className="raw-summary">Show raw request URL</summary>
        <div className="raw-url">{event.rawUrl}</div>
        {event.userAgent && (
          <div className="raw-url" style={{ marginTop: 8 }}>
            User-Agent: {event.userAgent}
          </div>
        )}
      </details>
    </div>
  );
}

function ParamRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="param-key">{k}</div>
      <div className="param-value">{v}</div>
    </>
  );
}
