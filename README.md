# hand-me-downs (Workers)

[![Typecheck](https://github.com/bring42/hand-me-downs-workers/actions/workflows/ci.yml/badge.svg?job=typecheck)](https://github.com/bring42/hand-me-downs-workers/actions/workflows/ci.yml)
[![Test](https://github.com/bring42/hand-me-downs-workers/actions/workflows/ci.yml/badge.svg?job=test)](https://github.com/bring42/hand-me-downs-workers/actions/workflows/ci.yml)
[![MET](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-met.yml/badge.svg?branch=main)](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-met.yml)
[![AIC](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-aic.yml/badge.svg?branch=main)](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-aic.yml)
[![Rijks](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-rijks.yml/badge.svg?branch=main)](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-rijks.yml)
[![CMA](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-cma.yml/badge.svg?branch=main)](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-cma.yml)
[![MIA](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-mia.yml/badge.svg?branch=main)](https://github.com/bring42/hand-me-downs-workers/actions/workflows/health-mia.yml)

> Want some real culture, kid? A Cloudflare Workers API serving CC0 art sources from the greatest institutions on the marble — the ones that let us common folk access it.

A port of [hand-me-downs](https://github.com/bring42/hand-me-downs) (Python CLI) to a Cloudflare Workers HTTP API, built with [Hono](https://hono.dev). Part of the [nice-inheritance](https://github.com/bring42/nice-inheritance) ecosystem — an open-source art frame aggregator.

No images are downloaded. Only structured JSON records with metadata and image source URLs.

## Sources

| Slug | Museum | API | Rate limit |
|------|--------|-----|------------|
| `met` | Metropolitan Museum of Art | [metmuseum.github.io](https://metmuseum.github.io/) | 80 req/s (use 60) |
| `aic` | Art Institute of Chicago | [api.artic.edu](https://api.artic.edu/docs/) | 60 req/min (use 1/s) |
| `rijks` | Rijksmuseum | [data.rijksmuseum.nl](https://data.rijksmuseum.nl/) | conservative 5/s |
| `cma` | Cleveland Museum of Art | [openaccess-api.clevelandart.org](https://openaccess-api.clevelandart.org/) | conservative 5/s |
| `mia` | Minneapolis Institute of Art | [search.artsmia.org](https://search.artsmia.org/) | conservative 10/s |

## Quick start

```bash
npm install
npm run dev          # → http://localhost:8787
```

### Deploy

```bash
npx wrangler deploy
```

For Rijks API key (if needed):
```bash
npx wrangler secret put RIJKS_API_KEY
```

For department caching via KV:
```bash
npx wrangler kv namespace create CACHE
# Paste the returned id into wrangler.toml, uncomment the [[kv_namespaces]] block
```

## API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Service info + available endpoints |
| `GET /api/:source/search?q=<query>&limit=<n>` | Keyword search (default limit: 20, max: 100) |
| `GET /api/:source/departments` | List departments/categories |
| `GET /api/:source/department/:name?limit=<n>` | Fetch CC0 works from a department |
| `GET /api/:source/ids?ids=<comma-separated>` | Fetch specific artworks by ID |
| `GET /api/all/search?q=<query>&limit=<n>` | Fan out to all sources in parallel |

Replace `:source` with one of: `met`, `aic`, `rijks`, `cma`, `mia`.

### Examples

```bash
# Search the MET for sunflowers
curl 'http://localhost:8787/api/met/search?q=sunflowers&limit=5'

# List AIC departments
curl 'http://localhost:8787/api/aic/departments'

# Fetch a specific MET object
curl 'http://localhost:8787/api/met/ids?ids=436535'

# Search all sources at once
curl 'http://localhost:8787/api/all/search?q=landscape&limit=10'

# Fetch CMA works from a department
curl 'http://localhost:8787/api/cma/department/Photography?limit=10'
```

## What gets included

- **Only** CC0 / public-domain records
- **Only** records that have at least one image
- Everything else is silently skipped

## Unified output format

Every record from every source is mapped to a common schema:

```json
{
  "uid": "MET-436535",
  "source": "met",
  "source_id": 436535,
  "title": "Wheat Field with Cypresses",
  "creator": "Vincent van Gogh",
  "date_display": "1889",
  "date_start": 1889,
  "date_end": 1889,
  "medium": "Oil on canvas",
  "dimensions": "28 7/8 × 36 3/4 in. (73.2 × 93.4 cm)",
  "classification": "Paintings",
  "department": "European Paintings",
  "credit_line": "Purchase, The Annenberg Foundation Gift, 1993",
  "description": "",
  "culture": "",
  "image_url": "https://images.metmuseum.org/...",
  "image_thumb": "https://images.metmuseum.org/...",
  "additional_images": [],
  "image_count": 1,
  "object_url": "https://www.metmuseum.org/art/collection/search/436535",
  "rights": "CC0"
}
```

The `uid` field (e.g. `MET-436535`, `AIC-27992`) is globally unique across all sources.

## Project structure

```
src/
  index.ts              # Hono router — all API routes, CORS, KV caching
  types.ts              # UnifiedRecord, Department, Env, SourceModule
  utils/
    rate-limiter.ts     # Timestamp-based rate limiter with async sleep
    fetcher.ts          # fetchJSON() — retry + exponential backoff on 429s
  sources/
    index.ts            # Source registry (met, aic, rijks, cma, mia)
    met.ts              # MET: search, departments, extract, adapt
    aic.ts              # AIC: IIIF images, ES search via POST
    rijks.ts            # Rijks: Dublin Core JSON-LD, CC0/PDM filtering
    cma.ts              # CMA: CC0 license check, multi-image support
    mia.ts              # MIA: Elasticsearch, image URL construction
wrangler.toml           # Workers config + KV binding
package.json
tsconfig.json
```

## Architecture

### Rate limiting

Each source has its own `RateLimiter` instance enforcing per-source request intervals. The limiter uses `Date.now()` timestamps with async sleep — no tokens, no queues, just minimum intervals between requests.

### Fetching

`fetchJSON()` wraps native `fetch()` with:
- Rate limiter integration
- Retry with exponential backoff on 429 and network errors (3 attempts)
- Query parameter building
- JSON parsing with null return on 404

### Source modules

Each source exports four functions matching the `SourceModule` interface:
- `search(query, limit)` — keyword search with CC0 filtering
- `departments()` — list departments/categories
- `departmentRecords(name, limit)` — fetch CC0 works from a department
- `idRecords(ids)` — fetch specific artworks by ID

### Filtering rules

- Only CC0 / public-domain records are included
- Only records with at least one image URL are included
- Non-qualifying records are silently skipped (no errors, no log spam)

### KV caching

Department lists are cached in Cloudflare KV (24-hour TTL) when the `CACHE` binding is configured. Gracefully falls back to direct API calls if KV is not set up.

## Code conventions

- TypeScript, strict mode
- `fetch()` (native Workers API) — no axios, no node-fetch
- Hono for routing + CORS
- Per-source rate limiting respecting each API's stated limits
- Retry with backoff on 429s
- Silent CC0/image filtering — only qualifying records returned
- Each source is a self-contained module exporting the `SourceModule` interface

## Contributing

This repo is rigged with [Copilot instructions](/.github/copilot-instructions.md) and a [new-source template](/.github/instructions/new-source.instructions.md) — so adding a museum is mostly "ask Copilot to add X" and review what comes out.

PRs welcome. Burn some tokens, add a source.

## License

CC0. The code, like the art it collects, is public domain. Do whatever you want with it.
