# hand-me-downs Workers

This project is a Cloudflare Workers API that collects CC0 public-domain artwork **metadata and image source URLs** from museum APIs. No images are downloaded — only structured JSON records. Built with Hono + TypeScript.

## Repository structure

```
src/
  index.ts              # Hono router — all API routes, CORS, KV caching
  types.ts              # UnifiedRecord, Department, Env, SourceModule interfaces
  utils/
    rate-limiter.ts     # Timestamp-based rate limiter with async sleep
    fetcher.ts          # fetchJSON() — retry + exponential backoff on 429s
  sources/
    index.ts            # Source registry — maps slug → module
    met.ts              # Metropolitan Museum of Art
    aic.ts              # Art Institute of Chicago
    rijks.ts            # Rijksmuseum
    cma.ts              # Cleveland Museum of Art
    mia.ts              # Minneapolis Institute of Art
wrangler.toml           # Workers config + KV binding
```

## Adding a new source

When asked to "add X" (a museum or collection), always:

1. Research the source's public API (rate limits, auth, pagination, public domain filtering, image delivery)
2. Create `src/sources/<slug>.ts` following the established pattern from `met.ts` and `aic.ts`
3. The module must export four functions matching `SourceModule`:
   - `search(query: string, limit: number): Promise<UnifiedRecord[]>`
   - `departments(): Promise<Department[]>`
   - `departmentRecords(name: string, limit: number): Promise<UnifiedRecord[]>`
   - `idRecords(ids: string[]): Promise<UnifiedRecord[]>`
4. Export the `adapt` function as `_adapt` (and any notable helpers) for testing
5. Register the new slug in `src/sources/index.ts` — import the module and add it to the `sources` record
6. Add unit tests in `test/<slug>.test.ts` — test `_adapt()` with valid CC0 data, non-CC0 rejection, missing images, edge cases
7. Create a health-check workflow at `.github/workflows/health-<slug>.yml` (copy an existing one, change the name and URL path)
8. Add a badge to `README.md` for the new health-check workflow:
   ```
   [![<NAME>](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-<slug>.yml/badge.svg?branch=main)](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-<slug>.yml)
   ```
9. Run `npm run typecheck` and `npm test` — both must pass
10. Smoke-test via `npm run dev` and hit `/api/<slug>/departments` and `/api/<slug>/search?q=test`

See `.github/instructions/new-source.instructions.md` for the full template.

## After any change in functionality

When `adapt()`, field extraction, or any part of a source changes the **output schema** (fields added, removed, or renamed):

1. **Update the README** — make sure the unified output format example reflects reality
2. **Update `types.ts`** if the `UnifiedRecord` interface changed
3. Verify typecheck passes: `npm run typecheck`

## Code conventions

- TypeScript, strict mode
- `fetch()` (native Workers API) — no axios, no node-fetch
- Hono for routing + CORS middleware
- Every source has its own `RateLimiter` instance respecting the API's stated limits
- `fetchJSON()` helper with retry + backoff on 429s (3 attempts, exponential)
- Only CC0 / public-domain records with images are included; everything else is silently skipped
- Each source module includes both `extract_record` logic and `adapt` mapping in a single file (combined from the Python version's separate `fetch_*.py` + `adapt.py`)
- IIIF URL construction for AIC and Rijks happens inside the source module
- Department lists are cached via KV (24h TTL) when the `CACHE` binding is configured

## Source-specific notes

### MET (`met.ts`)
- API: `https://collectionapi.metmuseum.org/public/collection/v1`
- Rate limit: 80 req/s (we use 60)
- Search returns IDs, then individual objects are fetched in parallel batches of 10
- CC0 check: `isPublicDomain === true` + `primaryImage` must be non-empty

### AIC (`aic.ts`)
- API: `https://api.artic.edu/api/v1`
- Rate limit: 60 req/min (we use 1/s)
- Uses POST to `/artworks/search` with Elasticsearch DSL
- Images via IIIF: `https://www.artic.edu/iiif/2/{image_id}/full/{size}/0/default.jpg`
- CC0 check: `is_public_domain === true` + `image_id` must exist

### Rijks (`rijks.ts`)
- API: `https://data.rijksmuseum.nl`
- Rate limit: conservative 5/s
- Dublin Core JSON-LD profile for object metadata
- Uses object types (painting, drawing, etc.) instead of departments
- CC0 check: `rights["@id"]` must be a CC0 or Public Domain Mark URI
- Image from `relation["@id"]` field

### CMA (`cma.ts`)
- API: `https://openaccess-api.clevelandart.org/api`
- Rate limit: conservative 5/s
- 21 fixed department names
- CC0 check: `share_license_status === "CC0"` + `images.web.url` must exist
- Multiple image sizes: web, print, full + alternate_images

### MIA (`mia.ts`)
- API: `https://search.artsmia.org`
- Rate limit: conservative 10/s
- Elasticsearch-based search with aggregation for departments
- Image URLs constructed from `Cache_Location` + `Primary_RenditionNumber`
- CC0 check: `public_access === 1` + `image === "valid"` + `rights_type === "Public Domain"`
