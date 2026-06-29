# url2pdf-workflow

[![License](https://img.shields.io/github/license/rjoydip/url2pdf-workflow)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0+-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3+-green)](https://bun.sh)
[![Fallow Health](.artifacts/fallow-health.svg)](https://docs.fallow.tools/)
[![CI](https://github.com/rjoydip/url2pdf-workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/rjoydip/url2pdf-workflow/actions/workflows/ci.yml)

Convert URLs to PDFs using Cloudflare Browser Rendering.

## Architecture

```
                                  ┌──────────────────┐
                                  │  Client Request  │
                                  │   GET /?url=...  │
                                  └────────┬─────────┘
                                           │
                                           ▼
                                   ┌───────────────┐
                                   │  Hono Router  │
                                   │ (src/index.ts) │
                                   └───────┬───────┘
                                           │
                              ┌────────────┴────────────┐
                              │                         │
                         (no url)                  (url present)
                              │                         │
                              ▼                         ▼
                      ┌──────────────┐         ┌───────────────┐
                      │  Metadata    │         │  R2 Cache     │
                      │  (JSON)      │         │  Check        │
                      └──────────────┘         └───┬───────┬───┘
                                                   │       │
                                              (hit)│       │(miss)
                                                   │       ▼
                                                   │  ┌──────────────────────┐
                                                   │  │  WORKFLOW.create()   │
                                                   │  │ Idempotent via md5   │
                                                   │  └──────────┬───────────┘
                                                   │             │
                                                   │             ▼
                                                   │  ┌──────────────────────┐
                                                   │  │ Url2PdfWorkflow      │
                                                   │  │ (src/workflows/)     │
                                                   │  │                      │
                                                   │  │ Step 1: generate-pdf │
                                                   │  │  - BROWSER.fetch()   │
                                                   │  │  - BUCKET.put()      │
                                                   │  │  (3 retries)         │
                                                   │  │                      │
                                                   │  │ Step 2: verify-stored│
                                                   │  │  - BUCKET.head()     │
                                                   │  └──────────┬───────────┘
                                                   │             │
                                                   │             ▼
                                                   │  ┌──────────────────────┐
                                                   │  │  R2 Store           │
                                                   │  │  (cache for future) │
                                                   │  └──────────────────────┘
                                                   │
                                                   │  ┌──────────────────────────┐
                                                   │  │  Auto-polling HTML page  │
                                                   │  │  polls /?url= every 2s   │
                                                   │  └──────────┬───────────────┘
                                                   │             │
                                                   │     ┌───────┴────────┐
                                                   │     │  PDF ready?    │
                                                   │     └───┬───┬────────┘
                                                   │     (no) │   │ (yes)
                                                   │     ┌────┘   │
                                                   │     ▼        │
                                                   │  poll again  │  window.location.href
                                                   │  (loop)      │  → PDF served from R2
                                                   │              │
                                                   ◄──────────────┘
                                                   │
                                                   ▼
                                           ┌───────────────┐
                                           │   Response    │
                                           │  PDF bytes    │
                                           └───────────────┘
```

### Flow

1. **Request**: `GET /?url=https://example.com`
2. **Validation**: URL is validated (must be http or https)
3. **Cache check**: Worker looks up the URL key in R2 bucket
4. **Cache hit**: Returns the PDF bytes directly from R2
5. **Cache miss**: Worker creates a Workflow instance (idempotent via md5 URL hash)
6. **Workflow Step 1 (generate-pdf)**: Browser Rendering opens the URL, generates PDF, stores in R2 (with 3 retries, exponential backoff)
7. **Workflow Step 2 (verify-stored)**: Confirms the PDF exists in R2
8. **Auto-polling HTML**: Returns an HTML page with a loading spinner and JavaScript that polls `/?url=<url>` every 2 seconds
9. **PDF delivered**: When the poll detects a PDF response (content-type `application/pdf`), the browser redirects to the same URL — no manual refresh needed

## Quick start

```sh
bun install
bun run dev
```

### Deploy

```sh
bun run deploy
```

Deploy automatically via CI on push to `main` — see [deploy.yml](.github/workflows/deploy.yml).

### Testing

#### Unit and integration tests

```sh
bun run test        # Run all tests
bun run test:watch  # Watch mode
```

#### Smoke test against a deployed instance

Set `DEPLOYED_URL` to the worker URL and run the integration tests against it:

```sh
DEPLOYED_URL=https://url2pdf.rjoydip.workers.dev bun test
```

The smoke tests confirm:

- `GET /` returns service metadata (200 + JSON body)
- `GET /?url=<valid>` returns 200 (PDF, or HTML processing page)
- `GET /?url=<invalid>` returns 400

#### Manual testing with curl

```sh
# Check service metadata
curl https://url2pdf.rjoydip.workers.dev/
```

```sh
# Generate a PDF (first call triggers workflow; poll until cached)
curl "https://url2pdf.rjoydip.workers.dev/?url=https://example.com" \
  --output example.pdf
```

```sh
# After the PDF is cached, subsequent calls return immediately:
curl "https://url2pdf.rjoydip.workers.dev/?url=https://example.com" \
  --output example.pdf
```

## API

### `GET /`

Returns service metadata as JSON when no `url` parameter is provided.

| Status | Description                   |
| ------ | ----------------------------- |
| `200`  | JSON object with service info |

**Example:**

```sh
curl https://url2pdf.rjoydip.workers.dev/
```

```json
{
  "name": "url2pdf-workflow",
  "version": "1.0.0",
  "description": "Convert URLs to PDFs using Cloudflare Browser Rendering",
  "source": "https://github.com/rjoydip/url2pdf-workflow",
  "endpoints": {
    "/": "Service metadata (this response)",
    "/?url=<url>": "Convert a URL to PDF"
  }
}
```

### `GET /?url=<url>`

Converts a URL to PDF.

| Param | Required | Description                                |
| ----- | -------- | ------------------------------------------ |
| `url` | Yes      | The URL to convert (must be http or https) |

**Responses**

| Status | Description                                                        |
| ------ | ------------------------------------------------------------------ |
| `200`  | PDF body (cached) or HTML auto-polling page (workflow in progress) |
| `400`  | Missing, empty, or malformed URL                                   |
| `500`  | Internal error (PDF generation failure, etc.)                      |

### Example

```sh
curl "https://url2pdf.rjoydip.workers.dev/?url=https://example.com" \
  --output example.pdf
```

## Caching

Generated PDFs are cached in an R2 bucket using a normalized URL as the key (trailing slashes stripped, query parameters sorted). Subsequent requests for the same URL first check the cache before creating a new Workflow instance.

## Prerequisites

- [Cloudflare Workers account](https://workers.cloudflare.com) with a [paid plan](https://developers.cloudflare.com/workers/platform/pricing/) (Browser Rendering requires Workers Paid)
- [R2 bucket](https://developers.cloudflare.com/r2/) named `url2pdf-bucket`
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated
- [Bun](https://bun.sh) >= 1.3

## Scripts

| Script                 | Description                  |
| ---------------------- | ---------------------------- |
| `bun run dev`          | Start local dev server       |
| `bun run deploy`       | Deploy to Cloudflare Workers |
| `bun run test`         | Run tests with bun           |
| `bun run test:watch`   | Run tests in watch mode      |
| `bun run lint`         | Lint with oxlint             |
| `bun run lint:fix`     | Lint and fix + format        |
| `bun run format`       | Format with oxfmt            |
| `bun run format:check` | Check formatting             |
| `bun run typecheck`    | Type-check with tsc --noEmit |

## Tech stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Linter**: oxlint
- **Formatter**: oxfmt
- **Testing**: bun test
- **Git hooks**: simple-git-hooks

## Cloudflare resources

| Resource          | Binding    | Description                                 |
| ----------------- | ---------- | ------------------------------------------- |
| Browser Rendering | `BROWSER`  | Remote browser for PDF generation           |
| R2 Bucket         | `BUCKET`   | Cache for generated PDFs (`url2pdf-bucket`) |
| Workflow          | `WORKFLOW` | Durable PDF generation (`Url2PdfWorkflow`)  |

## File structure

```
├── src/
│   ├── index.ts              # Worker entry point and request handler
│   ├── index.test.ts         # Unit tests for HTTP handler
│   ├── integration.test.ts   # Integration and deployment smoke tests
│   ├── env.d.ts              # Global type declarations (Bindings)
│   └── workflows/
│       ├── url2pdf.ts        # Workflow definition (Url2PdfWorkflow)
│       └── url2pdf.test.ts   # Unit tests for workflow class
├── .github/
│   └── workflows/
│       ├── ci.yml            # CI pipeline (lint, typecheck, format, test)
│       ├── deploy.yml        # Deploy to Cloudflare Workers
│       ├── fallow.yml        # Code analysis
│       └── pinact.yml        # GitHub Actions pin verification
├── AGENTS.md             # AI agent instructions
├── wrangler.jsonc        # Cloudflare Worker configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies and scripts
```
