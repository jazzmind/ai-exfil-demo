// Server-side storage abstraction for captured events.
// Exports: `recordEvent`, `getEvents`, `clearEvents`.

export type ExfilEvent = {
  id: string;
  timestamp: string;
  params: Record<string, string>;
  userAgent?: string;
  ip?: string;
  rawUrl: string;
  path: string;
};

const KEY = "exfil_events";
const MAX_EVENTS = 200;

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

async function upstashRequest(commands: unknown[]) {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    throw new Error("Upstash KV not configured");
  }

  const res = await fetch(KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstash request failed: ${res.status} ${text}`);
  }

  return res.json().catch(() => ({}));
}

// In-memory fallback for local development when KV is not configured.
declare global {
  // eslint-disable-next-line no-var
  var __EXFIL_EVENTS: ExfilEvent[] | undefined;
}

function inMemoryStore(): ExfilEvent[] {
  if (!global.__EXFIL_EVENTS) global.__EXFIL_EVENTS = [];
  return global.__EXFIL_EVENTS;
}

export async function recordEvent(ev: ExfilEvent): Promise<void> {
  if (KV_REST_API_URL && KV_REST_API_TOKEN) {
    // Store as JSON string in a Redis list, trim to MAX_EVENTS
    await upstashRequest([["LPUSH", KEY, JSON.stringify(ev)], ["LTRIM", KEY, "0", String(MAX_EVENTS - 1)]]);
    return;
  }

  const store = inMemoryStore();
  store.unshift(ev);
  if (store.length > MAX_EVENTS) store.length = MAX_EVENTS;
}

export async function getEvents(): Promise<ExfilEvent[]> {
  if (KV_REST_API_URL && KV_REST_API_TOKEN) {
    const body = await upstashRequest([["LRANGE", KEY, "0", String(MAX_EVENTS - 1)]]);
    // Upstash returns a JSON structure; try to extract the array robustly.
    const maybe = (body && (body.result ?? body.results ?? body)) as any;
    // If nested array (commands => [[...]]), flatten once.
    let list: any[] = [];
    if (Array.isArray(maybe)) {
      // If the response mirrors the commands array, it may be [[items]]
      if (maybe.length === 1 && Array.isArray(maybe[0])) list = maybe[0];
      else list = maybe;
    }

    const parsed: ExfilEvent[] = [];
    for (const item of list) {
      try {
        parsed.push(typeof item === "string" ? JSON.parse(item) : item);
      } catch {
        // ignore parse errors
      }
    }
    return parsed;
  }

  return inMemoryStore();
}

export async function clearEvents(): Promise<void> {
  if (KV_REST_API_URL && KV_REST_API_TOKEN) {
    await upstashRequest([["DEL", KEY]]);
    return;
  }

  const store = inMemoryStore();
  store.length = 0;
}
