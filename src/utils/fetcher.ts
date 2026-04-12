import { RateLimiter } from "./rate-limiter";

/**
 * Fetch JSON with retry + exponential backoff on 429s and network errors.
 */
export async function fetchJSON<T = unknown>(
  url: string,
  limiter: RateLimiter,
  options: {
    params?: Record<string, string | number | boolean | undefined>;
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    retries?: number;
  } = {}
): Promise<T | null> {
  const { method = "GET", body, headers = {}, retries = 3 } = options;

  // Build URL with query params
  let fullUrl = url;
  if (options.params) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(options.params)) {
      if (val !== undefined && val !== null) {
        searchParams.set(key, String(val));
      }
    }
    const qs = searchParams.toString();
    if (qs) {
      fullUrl += (url.includes("?") ? "&" : "?") + qs;
    }
  }

  await limiter.wait();

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const init: RequestInit = {
        method,
        headers: {
          "User-Agent": "hand-me-downs-workers/1.0 (github.com)",
          ...headers,
        },
      };
      if (body && method === "POST") {
        init.body = JSON.stringify(body);
        (init.headers as Record<string, string>)["Content-Type"] = "application/json";
      }

      const res = await fetch(fullUrl, init);

      if (res.ok) {
        return (await res.json()) as T;
      }
      if (res.status === 404) {
        return null;
      }
      if (res.status === 429) {
        await sleep(Math.pow(2, attempt) * 1000);
        await limiter.wait();
        continue;
      }
      // Other errors — retry with backoff
      if (attempt < retries - 1) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      console.error(`fetchJSON ${fullUrl} failed: ${res.status} ${res.statusText}`);
      return null;
    } catch (err) {
      if (attempt < retries - 1) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      console.error(`fetchJSON ${fullUrl} error:`, err);
      return null;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
