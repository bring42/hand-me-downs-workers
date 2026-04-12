import { UnifiedRecord, Department } from "../types";
import { RateLimiter } from "../utils/rate-limiter";
import { fetchJSON } from "../utils/fetcher";

const BASE = "https://openaccess-api.clevelandart.org/api";
const limiter = new RateLimiter(5);

const DEPARTMENTS = [
  "African Art",
  "American Painting and Sculpture",
  "Art of the Americas",
  "Chinese Art",
  "Contemporary Art",
  "Decorative Art and Design",
  "Drawings",
  "Egyptian and Ancient Near Eastern Art",
  "European Painting and Sculpture",
  "Greek and Roman Art",
  "Indian and South East Asian Art",
  "Islamic Art",
  "Japanese Art",
  "Korean Art",
  "Medieval Art",
  "Modern European Painting and Sculpture",
  "Oceania",
  "Performing Arts, Music, & Film",
  "Photography",
  "Prints",
  "Textiles",
];

// --- API types ---

interface CmaSearchResponse {
  info: { total: number };
  data: CmaArtwork[];
}

interface CmaArtwork {
  id: number;
  accession_number: string;
  title: string;
  creation_date: string;
  creation_date_earliest: number | null;
  creation_date_latest: number | null;
  technique: string;
  measurements: string;
  type: string;
  department: string;
  creditline: string;
  description: string;
  culture: string | string[];
  share_license_status: string;
  url: string;
  creators: Array<{ description?: string; nationality?: string }>;
  images: {
    web?: { url?: string };
    print?: { url?: string };
    full?: { url?: string };
  };
  alternate_images?: Array<{
    web?: { url?: string };
  }>;
}

interface CmaSingleResponse {
  data: CmaArtwork;
}

// --- Adapt ---

function adapt(obj: CmaArtwork): UnifiedRecord | null {
  if (obj.share_license_status !== "CC0") return null;

  const primary = obj.images?.web?.url || "";
  if (!primary) return null;

  const additional: string[] = [];
  for (const alt of obj.alternate_images || []) {
    const url = alt.web?.url;
    if (url) additional.push(url);
  }

  const creator = obj.creators?.[0];
  const artistName = creator?.description?.split("(")[0]?.trim() || "";

  const culture = Array.isArray(obj.culture) ? obj.culture.join(", ") : (obj.culture || "");

  return {
    uid: `CMA-${obj.id}`,
    source: "cma",
    source_id: obj.id,
    title: obj.title || "",
    creator: artistName,
    date_display: obj.creation_date || "",
    date_start: obj.creation_date_earliest ?? null,
    date_end: obj.creation_date_latest ?? null,
    medium: obj.technique || "",
    dimensions: obj.measurements || "",
    classification: obj.type || "",
    department: obj.department || "",
    credit_line: obj.creditline || "",
    description: obj.description || "",
    culture,
    image_url: primary,
    image_thumb: primary, // CMA uses same URL for thumb
    additional_images: additional,
    image_count: 1 + additional.length,
    object_url: obj.url || "",
    rights: "CC0",
  };
}

// Exported for testing
export { adapt as _adapt };

// --- Public API ---

export async function search(query: string, limit: number): Promise<UnifiedRecord[]> {
  const records: UnifiedRecord[] = [];
  let skip = 0;
  const pageSize = Math.min(limit, 1000);

  while (records.length < limit) {
    const data = await fetchJSON<CmaSearchResponse>(`${BASE}/artworks/`, limiter, {
      params: {
        q: query,
        cc0: "",
        has_image: 1,
        skip,
        limit: pageSize,
      },
    });
    if (!data?.data?.length) break;

    for (const obj of data.data) {
      const rec = adapt(obj);
      if (rec) {
        records.push(rec);
        if (records.length >= limit) break;
      }
    }
    skip += data.data.length;
    if (skip >= data.info.total) break;
  }
  return records;
}

export async function departments(): Promise<Department[]> {
  return DEPARTMENTS.map((name) => ({ name }));
}

export async function departmentRecords(name: string, limit: number): Promise<UnifiedRecord[]> {
  const records: UnifiedRecord[] = [];
  let skip = 0;
  const pageSize = Math.min(limit, 1000);

  while (records.length < limit) {
    const data = await fetchJSON<CmaSearchResponse>(`${BASE}/artworks/`, limiter, {
      params: {
        cc0: "",
        has_image: 1,
        department: name,
        skip,
        limit: pageSize,
      },
    });
    if (!data?.data?.length) break;

    for (const obj of data.data) {
      const rec = adapt(obj);
      if (rec) {
        records.push(rec);
        if (records.length >= limit) break;
      }
    }
    skip += data.data.length;
    if (skip >= data.info.total) break;
  }
  return records;
}

export async function idRecords(ids: string[]): Promise<UnifiedRecord[]> {
  const records: UnifiedRecord[] = [];
  for (const id of ids) {
    const data = await fetchJSON<CmaSingleResponse>(`${BASE}/artworks/${id}`, limiter);
    if (!data?.data) continue;
    const rec = adapt(data.data);
    if (rec) records.push(rec);
  }
  return records;
}
