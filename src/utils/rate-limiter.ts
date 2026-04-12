/**
 * Simple token-bucket rate limiter for Workers.
 * Since Workers are single-threaded per request, this uses a timestamp-based
 * approach with async sleep to enforce minimum intervals between requests.
 */
export class RateLimiter {
  private minInterval: number;
  private last: number = 0;

  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / requestsPerSecond;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.last;
    if (elapsed < this.minInterval) {
      await sleep(this.minInterval - elapsed);
    }
    this.last = Date.now();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
