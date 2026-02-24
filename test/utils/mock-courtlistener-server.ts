/**
 * Mock CourtListener API server for integration testing.
 * Uses Node's built-in http module — no external dependencies.
 */

import http from 'node:http';
import { URL } from 'node:url';
import { opinions, clusters, courts, judges, dockets } from './fixtures.js';

export interface MockServerInfo {
  server: http.Server;
  port: number;
  baseUrl: string;
}

// Rate-limit state per token
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_MAX = 5000;
const RATE_LIMIT_WINDOW_MS = 3600_000; // 1 hour

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUrl(req: http.IncomingMessage): URL {
  return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
}

function authenticate(req: http.IncomingMessage): boolean {
  const auth = req.headers.authorization;
  if (!auth) return false;
  // Accept any "Token <value>" header
  return auth.startsWith('Token ');
}

function getRateLimitHeaders(token: string): Record<string, string> {
  const now = Date.now();
  let state = rateLimitState.get(token);
  if (!state || now >= state.resetAt) {
    state = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitState.set(token, state);
  }
  state.count++;

  const remaining = Math.max(0, RATE_LIMIT_MAX - state.count);
  return {
    'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(state.resetAt / 1000)),
  };
}

function json(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(payload)),
    ...extraHeaders,
  });
  res.end(payload);
}

function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
  baseUrl: string,
  path: string,
): { count: number; next: string | null; previous: string | null; results: T[] } {
  const start = (page - 1) * pageSize;
  const results = items.slice(start, start + pageSize);
  const totalPages = Math.ceil(items.length / pageSize);

  const next =
    page < totalPages ? `${baseUrl}${path}?page=${page + 1}&page_size=${pageSize}` : null;
  const previous = page > 1 ? `${baseUrl}${path}?page=${page - 1}&page_size=${pageSize}` : null;

  return { count: items.length, next, previous, results };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, baseUrl: string): void {
  const url = parseUrl(req);
  const pathname = url.pathname.replace(/\/+$/, ''); // strip trailing slashes

  // --- Auth check (401) ---
  if (!authenticate(req)) {
    json(res, 401, { detail: 'Authentication credentials were not provided.' });
    return;
  }

  const token = (req.headers.authorization as string).slice(6); // after "Token "

  // --- Rate limit check (429) ---
  const rlHeaders = getRateLimitHeaders(token);
  if (parseInt(rlHeaders['X-RateLimit-Remaining'], 10) <= 0) {
    json(
      res,
      429,
      { detail: 'Request was throttled. Expected available in 60 seconds.' },
      { ...rlHeaders, 'Retry-After': '60' },
    );
    return;
  }

  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('page_size') ?? '20', 10);
  const query = url.searchParams.get('q') ?? '';

  // --- Search endpoint ---
  if (pathname === '/api/v4/search') {
    const type = url.searchParams.get('type') ?? 'o';
    let results = [...clusters];

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (c) =>
          c.case_name.toLowerCase().includes(q) || (c.summary?.toLowerCase().includes(q) ?? false),
      );
    }

    // Map clusters to search-result-like objects including type
    const searchResults = results.map((c) => ({ ...c, type }));
    json(res, 200, paginate(searchResults, page, pageSize, baseUrl, '/api/v4/search'), rlHeaders);
    return;
  }

  // --- Opinions ---
  const opinionMatch = pathname.match(/^\/api\/v4\/opinions\/(\d+)$/);
  if (opinionMatch) {
    const id = parseInt(opinionMatch[1], 10);
    const opinion = opinions.find((o) => o.id === id);
    if (!opinion) {
      json(res, 404, { detail: 'Not found.' }, rlHeaders);
      return;
    }
    json(res, 200, opinion, rlHeaders);
    return;
  }
  if (pathname === '/api/v4/opinions') {
    json(res, 200, paginate(opinions, page, pageSize, baseUrl, '/api/v4/opinions'), rlHeaders);
    return;
  }

  // --- Clusters ---
  const clusterMatch = pathname.match(/^\/api\/v4\/clusters\/(\d+)$/);
  if (clusterMatch) {
    const id = parseInt(clusterMatch[1], 10);
    const cluster = clusters.find((c) => c.id === id);
    if (!cluster) {
      json(res, 404, { detail: 'Not found.' }, rlHeaders);
      return;
    }
    json(res, 200, cluster, rlHeaders);
    return;
  }
  if (pathname === '/api/v4/clusters') {
    json(res, 200, paginate(clusters, page, pageSize, baseUrl, '/api/v4/clusters'), rlHeaders);
    return;
  }

  // --- Dockets ---
  const docketMatch = pathname.match(/^\/api\/v4\/dockets\/(\d+)$/);
  if (docketMatch) {
    const id = parseInt(docketMatch[1], 10);
    const docket = dockets.find((d) => d.id === id);
    if (!docket) {
      json(res, 404, { detail: 'Not found.' }, rlHeaders);
      return;
    }
    json(res, 200, docket, rlHeaders);
    return;
  }
  if (pathname === '/api/v4/dockets') {
    json(res, 200, paginate(dockets, page, pageSize, baseUrl, '/api/v4/dockets'), rlHeaders);
    return;
  }

  // --- Courts ---
  if (pathname === '/api/v4/courts') {
    let filtered = [...courts];
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          c.short_name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      );
    }
    json(res, 200, paginate(filtered, page, pageSize, baseUrl, '/api/v4/courts'), rlHeaders);
    return;
  }
  const courtMatch = pathname.match(/^\/api\/v4\/courts\/([a-z0-9]+)$/);
  if (courtMatch) {
    const courtId = courtMatch[1];
    const court = courts.find((c) => c.id === courtId);
    if (!court) {
      json(res, 404, { detail: 'Not found.' }, rlHeaders);
      return;
    }
    json(res, 200, court, rlHeaders);
    return;
  }

  // --- People (Judges) ---
  if (pathname === '/api/v4/people') {
    let filtered = [...judges];
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (j) => j.name_first.toLowerCase().includes(q) || j.name_last.toLowerCase().includes(q),
      );
    }
    json(res, 200, paginate(filtered, page, pageSize, baseUrl, '/api/v4/people'), rlHeaders);
    return;
  }
  const personMatch = pathname.match(/^\/api\/v4\/people\/(\d+)$/);
  if (personMatch) {
    const id = parseInt(personMatch[1], 10);
    const judge = judges.find((j) => j.id === id);
    if (!judge) {
      json(res, 404, { detail: 'Not found.' }, rlHeaders);
      return;
    }
    json(res, 200, judge, rlHeaders);
    return;
  }

  // --- Fallback 404 ---
  json(res, 404, { detail: 'Not found.' }, rlHeaders);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the mock CourtListener server on a random available port.
 */
export function startMockServer(): Promise<MockServerInfo> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // baseUrl is resolved after listen so the port is known
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      handleRequest(req, res, baseUrl);
    });

    server.on('error', reject);

    // Port 0 → OS assigns a random available port
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) {
        reject(new Error('Failed to get server address'));
        return;
      }
      const port = address.port;
      const baseUrl = `http://127.0.0.1:${port}`;
      rateLimitState.clear();
      resolve({ server, port, baseUrl });
    });
  });
}

/**
 * Stop the mock CourtListener server.
 */
export function stopMockServer(info: MockServerInfo): Promise<void> {
  return new Promise((resolve, reject) => {
    rateLimitState.clear();
    info.server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
