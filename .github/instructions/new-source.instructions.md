---
applyTo: "src/sources/*.ts"
description: "Use when: adding a new museum or collection source, creating a source module, scaffolding a new source. Triggered by prompts like 'add X', 'add rijksmuseum', 'new source', 'add a museum'."
---

# Adding a new museum / collection source

## Research phase

Before writing any code, research the API:

1. Find the official API docs
2. Identify: base URL, auth requirements, rate limits, pagination style
3. Confirm how to filter for **public domain / CC0** works
4. Confirm how images are delivered (direct URL, IIIF, or constructed)
5. Check if there's a department/category listing endpoint

## File to create

Create `src/sources/<slug>.ts` — a single file containing all API logic, extraction, and adaptation.

## Source module template

Follow this exact structure (reference `src/sources/met.ts` and `src/sources/aic.ts`):

```typescript
import { UnifiedRecord, Department } from "../types";
import { RateLimiter } from "../utils/rate-limiter";
import { fetchJSON } from "../utils/fetcher";

const BASE = "<API_BASE_URL>";
const limiter = new RateLimiter(<safe_rps>); // <stated_limit> — we use <safe_limit>

// --- API response types ---
// Define interfaces for the source's API responses here.

interface <Slug>Object {
  // ...fields specific to this API
}

// --- Helpers ---

/**
 * Adapt a native API record to the unified schema.
 * Returns null if the record is not CC0/public-domain or has no images.
 */
function adapt(obj: <Slug>Object): UnifiedRecord | null {
  // 1. Check public-domain status — return null if not CC0
  // 2. Check image availability — return null if no images
  // 3. Map to UnifiedRecord

  return {
    uid: `<SLUG>-${obj.<id_field>}`,
    source: "<slug>",
    source_id: obj.<id_field>,
    title: obj.<title_field> || "",
    creator: obj.<artist_field> || "",
    date_display: obj.<date_display_field> || "",
    date_start: obj.<date_start_field> ?? null,
    date_end: obj.<date_end_field> ?? null,
    medium: obj.<medium_field> || "",
    dimensions: obj.<dimensions_field> || "",
    classification: obj.<classification_field> || "",
    department: obj.<department_field> || "",
    credit_line: obj.<credit_field> || "",
    description: obj.<description_field> || "",
    culture: obj.<culture_field> || "",
    image_url: "<primary_image_url>",
    image_thumb: "<thumbnail_url>",
    additional_images: [],
    image_count: 1,
    object_url: "<object_page_url>",
    rights: "CC0",
  };
}

// --- Public API (must match SourceModule interface) ---

export async function search(query: string, limit: number): Promise<UnifiedRecord[]> {
  // Search the API, paginate if needed, filter through adapt()
  // Return up to `limit` records
}

export async function departments(): Promise<Department[]> {
  // Return available departments/categories
  // Some sources use aggregation queries, some have fixed lists
}

export async function departmentRecords(name: string, limit: number): Promise<UnifiedRecord[]> {
  // Fetch CC0 works from a specific department
}

export async function idRecords(ids: string[]): Promise<UnifiedRecord[]> {
  // Fetch specific artworks by ID
}
```

## Registration

After creating the source file, register it in `src/sources/index.ts`:

```typescript
import * as <slug> from "./<slug>";

export const sources: Record<string, SourceModule> = {
  // ...existing sources
  <slug>,
};
```

## Checklist

- [ ] Source module created at `src/sources/<slug>.ts`
- [ ] Exports all four `SourceModule` functions: `search`, `departments`, `departmentRecords`, `idRecords`
- [ ] `adapt()` filters on CC0/public-domain status
- [ ] `adapt()` filters on image availability (returns null if no images)
- [ ] `RateLimiter` instantiated with safe rate for the API
- [ ] Source registered in `src/sources/index.ts`
- [ ] `npm run typecheck` passes
- [ ] Smoke-tested via `npm run dev`:
  - `GET /api/<slug>/departments` returns a list
  - `GET /api/<slug>/search?q=test&limit=3` returns records
  - `GET /api/<slug>/ids?ids=<known_id>` returns a record

## Key rules

1. **Only CC0 / public-domain records** — silently skip anything else
2. **Only records with at least one image** — silently skip imageless records
3. **Use `fetchJSON()` from utils** — it handles rate limiting, retry, and backoff
4. **Instantiate a source-specific `RateLimiter`** — don't share across sources
5. **Keep it in one file** — API types, extraction, adaptation, and public API all in `src/sources/<slug>.ts`
6. **Use native `fetch()`** — no npm HTTP libraries (it's a Workers limitation)

## Image handling patterns

Different APIs deliver images differently:

- **Direct URL** (MET, CMA): Image URLs come directly from the API response
- **IIIF** (AIC, Rijks): Construct URLs from an image ID + IIIF template: `{base}/{id}/full/{size}/0/default.jpg`
- **Constructed** (MIA): Build URLs from path components: `{base}/{cache_path}/{stem}_{variant}.jpg`

Check which pattern the new source uses and handle accordingly in the `adapt()` function.
