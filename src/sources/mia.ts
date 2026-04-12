import { UnifiedRecord, Department } from "../types";
import { RateLimiter } from "../utils/rate-limiter";
import { fetchJSON } from "../utils/fetcher";

const BASE = "https://search.artsmia.org";
const IMG_BASE = "https://img.artsmia.org/web_objects_cache";
const limiter = new RateLimiter(10);

// --- API types ---

interface MiaSearchResponse {
  hits?: {
    total?: number;
    hits?: Array<{ _source: MiaObject; _id: string }>;
  };
  aggregations?: {
    Department?: {
      buckets: Array<{ key: string; doc_count: number }>;
    };
  };
}

interface MiaObject {
  id?: number;
  _id?: string;
  public_access?: number;
  image?: string;
  rights_type?: string;
  title?: string;
  artist?: string;
  role?: string;
  life_date?: string;
  nationality?: string;
  dated?: string;
  medium?: string;
  dimension?: string;
  classification?: string;
  object_name?: string;
  department?: string;
  creditline?: string;
  country?: string;
  culture?: string;
  accession_number?: string;
  Cache_Location?: string;
  Primary_RenditionNumber?: string;
}

// --- Helpers ---

function imageUrls(obj: MiaObject): { primary: string; thumb: string } {
  const cacheLoc = (obj.Cache_Location || "").replace(/\\/g, "/");
  const rendition = obj.Primary_RenditionNumber || "";
  if (!cacheLoc || !rendition) return { primary: "", thumb: "" };

  const stem = rendition.endsWith(".jpg") ? rendition.slice(0, -4) : rendition;
  const base = `${IMG_BASE}/${cacheLoc}/${stem}`;
  return {
    primary: `${base}_full.jpg`,
    thumb: `${base}_400.jpg`,
  };
}

function adapt(obj: MiaObject): UnifiedRecord | null {
  if (obj.public_access !== 1) return null;
  if (obj.image !== "valid") return null;
  if (obj.rights_type !== "Public Domain") return null;

  const { primary, thumb } = imageUrls(obj);
  if (!primary) return null;

  const objectId = obj.id || obj._id;
  if (!objectId) return null;

  return {
    uid: `MIA-${objectId}`,
    source: "mia",
    source_id: Number(objectId),
    title: obj.title || "",
    creator: obj.artist || "",
    date_display: obj.dated || "",
    date_start: null,
    date_end: null,
    medium: obj.medium || "",
    dimensions: (obj.dimension || "").replace(/\r\n/g, "; "),
    classification: obj.classification || "",
    department: obj.department || "",
    credit_line: obj.creditline || "",
    description: "",
    culture: obj.culture || "",
    image_url: primary,
    image_thumb: thumb,
    additional_images: [],
    image_count: 1,
    object_url: `https://collections.artsmia.org/art/${objectId}`,
    rights: "Public Domain",
  };
}

// Exported for testing
export { adapt as _adapt, imageUrls as _imageUrls };

// --- Public API ---

export async function search(query: string, limit: number): Promise<UnifiedRecord[]> {
  const data = await fetchJSON<MiaSearchResponse>(
    `${BASE}/${encodeURIComponent(query)}`,
    limiter,
    { params: { filters: "public_access:1", size: limit } }
  );
  if (!data?.hits?.hits) return [];

  const records: UnifiedRecord[] = [];
  for (const hit of data.hits.hits) {
    const obj = { ...hit._source, _id: hit._id };
    const rec = adapt(obj);
    if (rec) records.push(rec);
  }
  return records;
}

export async function departments(): Promise<Department[]> {
  const data = await fetchJSON<MiaSearchResponse>(`${BASE}/*`, limiter, {
    params: { filters: "public_access:1", size: 0 },
  });
  if (!data?.aggregations?.Department) return [];
  return data.aggregations.Department.buckets.map((b) => ({
    name: b.key,
    count: b.doc_count,
  }));
}

export async function departmentRecords(name: string, limit: number): Promise<UnifiedRecord[]> {
  // Mia supports multiple filter params as comma-delimited
  const data = await fetchJSON<MiaSearchResponse>(`${BASE}/*`, limiter, {
    params: {
      filters: `public_access:1,department:"${name}"`,
      size: limit,
    },
  });
  if (!data?.hits?.hits) return [];

  const records: UnifiedRecord[] = [];
  for (const hit of data.hits.hits) {
    const obj = { ...hit._source, _id: hit._id };
    const rec = adapt(obj);
    if (rec) records.push(rec);
  }
  return records;
}

export async function idRecords(ids: string[]): Promise<UnifiedRecord[]> {
  const records: UnifiedRecord[] = [];
  for (const id of ids) {
    const data = await fetchJSON<MiaObject>(`${BASE}/id/${id}`, limiter);
    if (!data) continue;
    const rec = adapt(data);
    if (rec) records.push(rec);
  }
  return records;
}
