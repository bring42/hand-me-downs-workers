import { UnifiedRecord, Department } from "../types";
import { RateLimiter } from "../utils/rate-limiter";
import { fetchJSON } from "../utils/fetcher";

const BASE = "https://collectionapi.metmuseum.org/public/collection/v1";
const limiter = new RateLimiter(60); // 80/s hard cap, stay at 60

// --- API types ---

interface MetDepartment {
  departmentId: number;
  displayName: string;
}

interface MetSearchResponse {
  total: number;
  objectIDs: number[] | null;
}

interface MetDepartmentsResponse {
  departments: MetDepartment[];
}

interface MetObject {
  objectID: number;
  isPublicDomain: boolean;
  primaryImage: string;
  primaryImageSmall: string;
  additionalImages: string[];
  title: string;
  artistDisplayName: string;
  objectDate: string;
  objectBeginDate: number | null;
  objectEndDate: number | null;
  medium: string;
  dimensions: string;
  classification: string;
  department: string;
  creditLine: string;
  culture: string;
  objectURL: string;
  [key: string]: unknown;
}

// --- Extract & Adapt ---

// Applied arts / functional objects that are rarely what users are looking for
const BLOCKED_CLASSIFICATIONS = new Set([
  "Arms and Armor",
  "Metalwork",
  "Woodwork",
  "Furniture",
  "Clocks and Watches",
  "Musical Instruments",
  "Textiles",
  "Ceramics",
  "Glass",
  "Enamels",
  "Ivories",
  "Leather",
  "Lacquerware",
  "Netsuke",
]);

function adapt(obj: MetObject): UnifiedRecord | null {
  if (!obj.isPublicDomain) return null;
  const primary = obj.primaryImage || "";
  if (!primary) return null;
  if (obj.classification && BLOCKED_CLASSIFICATIONS.has(obj.classification)) return null;

  const additional = obj.additionalImages || [];
  const allImages = [primary, ...additional];

  return {
    uid: `MET-${obj.objectID}`,
    source: "met",
    source_id: obj.objectID,
    title: obj.title || "",
    creator: obj.artistDisplayName || "",
    date_display: obj.objectDate || "",
    date_start: obj.objectBeginDate ?? null,
    date_end: obj.objectEndDate ?? null,
    medium: obj.medium || "",
    dimensions: obj.dimensions || "",
    classification: obj.classification || "",
    department: obj.department || "",
    credit_line: obj.creditLine || "",
    description: "",
    culture: obj.culture || "",
    image_url: primary,
    image_thumb: obj.primaryImageSmall || "",
    additional_images: additional,
    image_count: allImages.length,
    object_url: obj.objectURL || "",
    rights: "CC0",
  };
}

// Exported for testing
export { adapt as _adapt };

function matchesQuery(rec: UnifiedRecord, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [
    rec.title,
    rec.creator,
    rec.culture,
    rec.department,
    rec.classification,
    rec.description,
  ].join(" ").toLowerCase();
  return terms.every(term => haystack.includes(term));
}

// --- Public API ---

export async function search(query: string, limit: number): Promise<UnifiedRecord[]> {
  const data = await fetchJSON<MetSearchResponse>(`${BASE}/search`, limiter, {
    params: { q: query, hasImages: true, isPublicDomain: true },
  });
  const ids = data?.objectIDs || [];
  // Shuffle a window of candidates so the same top-ranked objects
  // don't dominate every response. We shuffle the first 500 IDs
  // (keeping results broadly relevant) then take limit*5 from that pool.
  const pool = ids.slice(0, Math.min(ids.length, 500));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const records = await fetchByIds(pool.slice(0, Math.min(pool.length, limit * 5)));
  return records.filter(rec => matchesQuery(rec, query));
}

export async function departments(): Promise<Department[]> {
  const data = await fetchJSON<MetDepartmentsResponse>(`${BASE}/departments`, limiter);
  if (!data) return [];
  return data.departments.map((d) => ({
    name: d.displayName,
    id: d.departmentId,
  }));
}

export async function departmentRecords(name: string, limit: number): Promise<UnifiedRecord[]> {
  // First find the department ID by name
  const depts = await departments();
  const dept = depts.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (!dept) return [];

  const data = await fetchJSON<MetSearchResponse>(`${BASE}/objects`, limiter, {
    params: { departmentIds: dept.id as number },
  });
  const ids = data?.objectIDs || [];
  return fetchByIds(ids.slice(0, Math.min(ids.length, limit * 5)), limit);
}

export async function idRecords(ids: string[]): Promise<UnifiedRecord[]> {
  return fetchByIds(ids.map(Number).filter((n) => !isNaN(n)));
}

// --- Internal ---

async function fetchByIds(ids: number[], limit?: number): Promise<UnifiedRecord[]> {
  const records: UnifiedRecord[] = [];
  // Fetch in parallel batches of 10 to respect rate limits
  const batchSize = 10;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((id) => fetchJSON<MetObject>(`${BASE}/objects/${id}`, limiter))
    );
    for (const obj of results) {
      if (!obj) continue;
      const rec = adapt(obj);
      if (rec) records.push(rec);
    }
    // Stop early once we have enough results to preserve relevance ordering
    if (limit && records.length >= limit) {
      return records.slice(0, limit);
    }
  }
  return records;
}
