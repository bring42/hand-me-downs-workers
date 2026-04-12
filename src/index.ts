import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Department, UnifiedRecord } from "./types";
import { sources, sourceNames } from "./sources";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEPT_CACHE_TTL = 86400; // 24 hours

function parseLimit(raw: string | undefined): number {
  const n = parseInt(raw || "", 10);
  if (isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function getSource(name: string) {
  const mod = sources[name];
  if (!mod) return null;
  return mod;
}

async function getCachedDepartments(
  kv: KVNamespace | undefined,
  sourceName: string,
  fetcher: () => Promise<Department[]>
): Promise<Department[]> {
  const cacheKey = `departments:${sourceName}`;
  if (kv) {
    const cached = await kv.get(cacheKey, "json");
    if (cached) return cached as Department[];
  }
  const depts = await fetcher();
  if (kv && depts.length > 0) {
    await kv.put(cacheKey, JSON.stringify(depts), { expirationTtl: DEPT_CACHE_TTL });
  }
  return depts;
}

// --- Health check ---

app.get("/", (c) =>
  c.json({
    name: "hand-me-downs",
    description: "CC0 public-domain artwork metadata API",
    sources: sourceNames,
    endpoints: [
      "GET /api/:source/search?q=<query>&limit=<n>",
      "GET /api/:source/departments",
      "GET /api/:source/department/:name?limit=<n>",
      "GET /api/:source/ids?ids=<comma-separated>",
      "GET /api/all/search?q=<query>&limit=<n>",
    ],
  })
);

// --- Fan-out: search all sources ---

app.get("/api/all/search", async (c) => {
  const query = c.req.query("q");
  if (!query) return c.json({ error: "Missing ?q= parameter" }, 400);
  const limit = parseLimit(c.req.query("limit"));

  const results = await Promise.all(
    sourceNames.map(async (name) => {
      try {
        const records = await sources[name].search(query, limit);
        return { source: name, total: records.length, records };
      } catch (err) {
        console.error(`[${name}] search error:`, err);
        return { source: name, total: 0, records: [] as UnifiedRecord[], error: String(err) };
      }
    })
  );

  const allRecords = results.flatMap((r) => r.records);
  return c.json({
    query,
    limit,
    total: allRecords.length,
    by_source: results.map(({ source, total, ...rest }) => ({
      source,
      total,
      ...("error" in rest ? { error: rest.error } : {}),
    })),
    records: allRecords,
  });
});

// --- Per-source routes ---

app.get("/api/:source/search", async (c) => {
  const src = getSource(c.req.param("source"));
  if (!src) return c.json({ error: `Unknown source. Available: ${sourceNames.join(", ")}` }, 404);

  const query = c.req.query("q");
  if (!query) return c.json({ error: "Missing ?q= parameter" }, 400);
  const limit = parseLimit(c.req.query("limit"));

  const records = await src.search(query, limit);
  return c.json({ source: c.req.param("source"), query, total: records.length, records });
});

app.get("/api/:source/departments", async (c) => {
  const src = getSource(c.req.param("source"));
  if (!src) return c.json({ error: `Unknown source. Available: ${sourceNames.join(", ")}` }, 404);

  const depts = await getCachedDepartments(c.env.CACHE, c.req.param("source"), () => src.departments());
  return c.json({ source: c.req.param("source"), departments: depts });
});

app.get("/api/:source/department/:name", async (c) => {
  const src = getSource(c.req.param("source"));
  if (!src) return c.json({ error: `Unknown source. Available: ${sourceNames.join(", ")}` }, 404);

  const name = decodeURIComponent(c.req.param("name"));
  const limit = parseLimit(c.req.query("limit"));

  const records = await src.departmentRecords(name, limit);
  return c.json({ source: c.req.param("source"), department: name, total: records.length, records });
});

app.get("/api/:source/ids", async (c) => {
  const src = getSource(c.req.param("source"));
  if (!src) return c.json({ error: `Unknown source. Available: ${sourceNames.join(", ")}` }, 404);

  const idsParam = c.req.query("ids");
  if (!idsParam) return c.json({ error: "Missing ?ids= parameter" }, 400);

  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return c.json({ error: "No valid IDs provided" }, 400);

  const records = await src.idRecords(ids);
  return c.json({ source: c.req.param("source"), total: records.length, records });
});

export default app;
