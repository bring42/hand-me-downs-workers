import { UnifiedRecord, Department } from "../types";
import { RateLimiter } from "../utils/rate-limiter";
import { fetchJSON } from "../utils/fetcher";

const BASE = "https://api.artic.edu/api/v1";
const IIIF_BASE = "https://www.artic.edu/iiif/2";
const limiter = new RateLimiter(1); // 60/min anonymous = 1/s

const ARTWORK_FIELDS = [
  "id", "title", "artist_display", "artist_title",
  "date_start", "date_end", "date_display",
  "medium_display", "dimensions",
  "department_title", "department_id",
  "classification_title",
  "credit_line", "is_public_domain",
  "image_id", "alt_image_ids",
  "short_description", "description",
  "place_of_origin",
].join(",");

// --- API types ---

interface AicArtwork {
  id: number;
  title: string;
  artist_display: string;
  artist_title: string;
  date_display: string;
  date_start: number | null;
  date_end: number | null;
  medium_display: string;
  dimensions: string;
  department_title: string;
  department_id: number;
  classification_title: string;
  credit_line: string;
  is_public_domain: boolean;
  image_id: string | null;
  alt_image_ids: string[];
  short_description: string;
  description: string;
  place_of_origin: string;
}

interface AicSearchResponse {
  data: AicArtwork[];
  pagination: { total: number; current_page: number; total_pages: number };
}

interface AicAggResponse {
  aggregations?: {
    department_title?: {
      buckets: Array<{ key: string; doc_count: number }>;
    };
  };
}

interface AicIdsResponse {
  data: AicArtwork[];
}

// --- Helpers ---

function iiifUrl(imageId: string, size = "843,"): string {
  return `${IIIF_BASE}/${imageId}/full/${size}/0/default.jpg`;
}

function adapt(obj: AicArtwork): UnifiedRecord | null {
  if (!obj.is_public_domain) return null;
  if (!obj.image_id) return null;

  const primary = iiifUrl(obj.image_id);
  const thumb = iiifUrl(obj.image_id, "400,");
  const altIds = obj.alt_image_ids || [];
  const additional = altIds.map((id) => iiifUrl(id));

  return {
    uid: `AIC-${obj.id}`,
    source: "aic",
    source_id: obj.id,
    title: obj.title || "",
    creator: obj.artist_display || "",
    date_display: obj.date_display || "",
    date_start: obj.date_start ?? null,
    date_end: obj.date_end ?? null,
    medium: obj.medium_display || "",
    dimensions: obj.dimensions || "",
    classification: obj.classification_title || "",
    department: obj.department_title || "",
    credit_line: obj.credit_line || "",
    description: obj.short_description || obj.description || "",
    culture: "",
    image_url: primary,
    image_thumb: thumb,
    additional_images: additional,
    image_count: 1 + additional.length,
    object_url: `https://www.artic.edu/artworks/${obj.id}`,
    rights: "CC0",
  };
}

// Exported for testing
export { adapt as _adapt };

// --- Public API ---

export async function search(query: string, limit: number): Promise<UnifiedRecord[]> {
  const records: UnifiedRecord[] = [];
  let page = 1;
  const pageSize = Math.min(limit, 100);

  while (records.length < limit) {
    const data = await fetchJSON<AicSearchResponse>(`${BASE}/artworks/search`, limiter, {
      method: "POST",
      body: {
        q: query,
        query: { bool: { must: [{ term: { is_public_domain: true } }] } },
        fields: ARTWORK_FIELDS.split(","),
        limit: pageSize,
        page,
      },
    });
    if (!data || !data.data?.length) break;

    for (const obj of data.data) {
      const rec = adapt(obj);
      if (rec) {
        records.push(rec);
        if (records.length >= limit) break;
      }
    }
    if (page >= (data.pagination?.total_pages ?? 1)) break;
    page++;
  }
  return records;
}

export async function departments(): Promise<Department[]> {
  const data = await fetchJSON<AicAggResponse>(`${BASE}/artworks/search`, limiter, {
    method: "POST",
    body: {
      query: { term: { is_public_domain: true } },
      limit: 0,
      aggs: {
        department_title: {
          terms: { field: "department_title.keyword", size: 50 },
        },
      },
    },
  });
  if (!data?.aggregations?.department_title) return [];
  return data.aggregations.department_title.buckets.map((b) => ({
    name: b.key,
    count: b.doc_count,
  }));
}

export async function departmentRecords(name: string, limit: number): Promise<UnifiedRecord[]> {
  const records: UnifiedRecord[] = [];
  let page = 1;
  const pageSize = Math.min(limit, 100);

  while (records.length < limit) {
    const data = await fetchJSON<AicSearchResponse>(`${BASE}/artworks/search`, limiter, {
      method: "POST",
      body: {
        query: {
          bool: {
            must: [
              { term: { is_public_domain: true } },
              { term: { "department_title.keyword": name } },
            ],
          },
        },
        fields: ARTWORK_FIELDS.split(","),
        limit: pageSize,
        page,
      },
    });
    if (!data || !data.data?.length) break;

    for (const obj of data.data) {
      const rec = adapt(obj);
      if (rec) {
        records.push(rec);
        if (records.length >= limit) break;
      }
    }
    if (page >= (data.pagination?.total_pages ?? 1)) break;
    page++;
  }
  return records;
}

export async function idRecords(ids: string[]): Promise<UnifiedRecord[]> {
  const numericIds = ids.map(Number).filter((n) => !isNaN(n));
  const records: UnifiedRecord[] = [];

  // AIC supports up to 100 ids per request
  for (let i = 0; i < numericIds.length; i += 100) {
    const batch = numericIds.slice(i, i + 100);
    const idStr = batch.join(",");
    const data = await fetchJSON<AicIdsResponse>(`${BASE}/artworks`, limiter, {
      params: { ids: idStr, fields: ARTWORK_FIELDS },
    });
    if (!data?.data) continue;
    for (const obj of data.data) {
      const rec = adapt(obj);
      if (rec) records.push(rec);
    }
  }
  return records;
}
