import { describe, it, expect } from "vitest";
import app from "../src/index";

describe("routes", () => {
  const env = {} as any;

  it("GET / returns health check with source list", async () => {
    const res = await app.request("/", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("hand-me-downs");
    expect(body.sources).toContain("met");
    expect(body.sources).toContain("aic");
    expect(body.sources).toContain("rijks");
    expect(body.sources).toContain("cma");
    expect(body.sources).toContain("mia");
    expect(body.endpoints).toBeInstanceOf(Array);
  });

  it("GET /api/unknown/search returns 404", async () => {
    const res = await app.request("/api/unknown/search?q=test", {}, env);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Unknown source");
  });

  it("GET /api/met/search without ?q= returns 400", async () => {
    const res = await app.request("/api/met/search", {}, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing ?q=");
  });

  it("GET /api/met/ids without ?ids= returns 400", async () => {
    const res = await app.request("/api/met/ids", {}, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing ?ids=");
  });

  it("GET /api/met/ids with empty ids returns 400", async () => {
    const res = await app.request("/api/met/ids?ids=", {}, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing ?ids=");
  });

  it("GET /api/all/search without ?q= returns 400", async () => {
    const res = await app.request("/api/all/search", {}, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing ?q=");
  });

  it("responds with CORS headers", async () => {
    const res = await app.request("/", {
      headers: { Origin: "https://example.com" },
    }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });
});
