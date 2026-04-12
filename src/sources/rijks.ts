import { UnifiedRecord, Department } from "../types";
import { RateLimiter } from "../utils/rate-limiter";
import { fetchJSON } from "../utils/fetcher";

const SEARCH_BASE = "https://data.rijksmuseum.nl/search/collection";
const DATA_BASE = "https://data.rijksmuseum.nl";
const limiter = new RateLimiter(5);

const PD_RIGHTS = new Set([
  "https://creativecommons.org/publicdomain/zero/1.0/",
  "https://creativecommons.org/publicdomain/mark/1.0/",
  "http://creativecommons.org/publicdomain/zero/1.0/",
  "http://creativecommons.org/publicdomain/mark/1.0/",
]);

const OBJECT_TYPES = [
  "painting", "drawing", "print", "photograph", "sculpture",
  "furniture", "textile", "jewellery", "miniature", "model",
];

// --- API types ---

interface RijksSearchResponse {
  partOf?: { totalItems?: number };
  orderedItems?: Array<{ id: string }>;
  next?: { id?: string };
}

interface RijksObject {
  title?: string | Array<{ "@language"?: string; "@value"?: string }> | { "@value"?: string; title?: string };
  creator?: unknown;
  date?: string;
  description?: string;
  format?: unknown;
  type?: unknown;
  rights?: { "@id"?: string } | string;
  relation?: { "@id"?: string } | string;
  identifier?: string;
  subject?: unknown;
  coverage?: { title?: string } | string;
}

// --- Helpers ---

function extractTitle(val: unknown): string {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    for (const item of val) {
      if (typeof item === "object" && item && (item as Record<string, string>)["@language"] === "en")
        return (item as Record<string, string>)["@value"] || "";
    }
    for (const item of val) {
      if (typeof item === "object" && item) return (item as Record<string, string>)["@value"] || "";
      if (typeof item === "string") return item;
    }
  }
  if (typeof val === "object" && val) {
    const o = val as Record<string, unknown>;
    return (o["@value"] as string) || (o["title"] as string) || "";
  }
  return val ? String(val) : "";
}

function extractCreatorName(raw: unknown): string {
  if (!raw) return "";
  const items = Array.isArray(raw) ? raw : [raw];
  return items
    .map((c) => {
      if (typeof c === "string") return c;
      if (typeof c === "object" && c) return (c as Record<string, string>).title || "";
      return "";
    })
    .filter(Boolean)
    .join(", ");
}

function extractTypeLabel(typ: unknown): string {
  if (!typ) return "";
  if (typeof typ === "string") return typ;
  if (typeof typ === "object" && typ) {
    const t = (typ as Record<string, unknown>).title;
    if (Array.isArray(t)) {
      for (const sub of t) {
        if (typeof sub === "object" && sub && (sub as Record<string, string>)["@language"] === "en")
          return (sub as Record<string, string>)["@value"] || "";
      }
      for (const sub of t) {
        if (typeof sub === "object" && sub) return (sub as Record<string, string>)["@value"] || "";
      }
    }
    return typeof t === "string" ? t : "";
  }
  return "";
}

function extractFormatLabels(fmt: unknown): string[] {
  if (!fmt) return [];
  const items = Array.isArray(fmt) ? fmt : [fmt];
  const labels: string[] = [];
  for (const item of items) {
    if (typeof item === "string") { labels.push(item); continue; }
    if (typeof item === "object" && item) {
      const t = (item as Record<string, unknown>).title;
      if (typeof t === "string" && t) labels.push(t);
      else if (Array.isArray(t)) {
        for (const sub of t) {
          if (typeof sub === "object" && sub && (sub as Record<string, string>)["@language"] === "en") {
            labels.push((sub as Record<string, string>)["@value"] || "");
            break;
          }
        }
      }
    }
  }
  return labels.filter(Boolean);
}

function adapt(obj: RijksObject, objectId: string): UnifiedRecord | null {
  const rights = obj.rights;
  const rightsUri = typeof rights === "object" && rights ? (rights as Record<string, string>)["@id"] || "" : String(rights || "");
  if (!PD_RIGHTS.has(rightsUri)) return null;

  const relation = obj.relation;
  const imageUrl = typeof relation === "object" && relation ? (relation as Record<string, string>)["@id"] || "" : String(relation || "");
  if (!imageUrl) return null;

  const imageSmall = imageUrl.replace("/full/max/", "/full/400,/");
  const objectNumber = obj.identifier || "";

  return {
    uid: `RIJKS-${objectId}`,
    source: "rijks",
    source_id: objectId,
    title: extractTitle(obj.title),
    creator: extractCreatorName(obj.creator),
    date_display: (obj.date as string) || "",
    date_start: null,
    date_end: null,
    medium: extractFormatLabels(obj.format).join(", "),
    dimensions: "",
    classification: extractTypeLabel(obj.type),
    department: "",
    credit_line: "",
    description: (obj.description as string) || "",
    culture: "",
    image_url: imageUrl,
    image_thumb: imageSmall,
    additional_images: [],
    image_count: 1,
    object_url: objectNumber
      ? `https://www.rijksmuseum.nl/en/collection/${objectNumber}`
      : `https://id.rijksmuseum.nl/${objectId}`,
    rights: rightsUri.includes("zero") ? "CC0" : "Public Domain Mark",
  };
}

// Exported for testing
export { adapt as _adapt, extractTitle as _extractTitle, extractCreatorName as _extractCreatorName };

// --- Internal ---

async function searchObjects(params: Record<string, string> = {}): Promise<{ ids: string[]; total: number; nextToken: string | null }> {
  const data = await fetchJSON<RijksSearchResponse>(SEARCH_BASE, limiter, {
    params: { imageAvailable: "true", ...params },
  });
  if (!data) return { ids: [], total: 0, nextToken: null };

  const total = data.partOf?.totalItems ?? 0;
  const ids = (data.orderedItems || [])
    .filter((item) => item.id)
    .map((item) => item.id.split("/").pop()!)
    .filter(Boolean);

  let nextToken: string | null = null;
  const nextUrl = data.next?.id;
  if (nextUrl && nextUrl.includes("pageToken=")) {
    nextToken = nextUrl.split("pageToken=")[1]?.split("&")[0] || null;
  }

  return { ids, total, nextToken };
}

async function fetchObject(id: string): Promise<RijksObject | null> {
  return fetchJSON<RijksObject>(`${DATA_BASE}/${id}`, limiter, {
    params: { _profile: "dc", _mediatype: "application/ld+json" },
  });
}

async function fetchByIds(ids: string[], limit?: number): Promise<UnifiedRecord[]> {
  const records: UnifiedRecord[] = [];
  const toFetch = limit ? ids.slice(0, limit) : ids;

  const batchSize = 5;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (id) => {
        const obj = await fetchObject(id);
        return obj ? adapt(obj, id) : null;
      })
    );
    for (const rec of results) {
      if (rec) records.push(rec);
    }
  }
  return records;
}

// --- Public API ---

export async function search(query: string, limit: number): Promise<UnifiedRecord[]> {
  const allIds: string[] = [];
  let nextToken: string | null = null;

  while (allIds.length < limit * 2) {
    const params: Record<string, string> = { title: query };
    if (nextToken) params.pageToken = nextToken;

    const result = await searchObjects(params);
    allIds.push(...result.ids);
    nextToken = result.nextToken;
    if (!nextToken || result.ids.length === 0) break;
  }

  return fetchByIds(allIds, limit);
}

export async function departments(): Promise<Department[]> {
  // Rijks uses object types rather than departments
  const results: Department[] = [];
  for (const type of OBJECT_TYPES) {
    const { total } = await searchObjects({ type });
    results.push({ name: type, count: total });
  }
  return results;
}

export async function departmentRecords(name: string, limit: number): Promise<UnifiedRecord[]> {
  const allIds: string[] = [];
  let nextToken: string | null = null;

  while (allIds.length < limit * 2) {
    const params: Record<string, string> = { type: name };
    if (nextToken) params.pageToken = nextToken;

    const result = await searchObjects(params);
    allIds.push(...result.ids);
    nextToken = result.nextToken;
    if (!nextToken || result.ids.length === 0) break;
  }

  return fetchByIds(allIds, limit);
}

export async function idRecords(ids: string[]): Promise<UnifiedRecord[]> {
  return fetchByIds(ids);
}
