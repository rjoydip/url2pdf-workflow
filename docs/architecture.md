# Architecture

```
                                 ┌──────────────────┐
                                 │  Client Request  │
                                 │ GET /url2pdf?url │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                  ┌───────────────┐
                                  │  Hono Router  │
                                  │ (src/index.ts) │
                                  └───────┬───────┘
                                          │
                                          ▼
                                  ┌───────────────┐
                                  │  R2 Cache     │
                                  │  Check        │
                                  └───┬───────┬───┘
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
                                       │  │  - BROWSER.fetch()    │
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
                                      │  └──────────┬───────────┘
                                      │             │
                                      ◄─────────────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │   Response    │
                              │  PDF bytes    │
                              └───────────────┘
```

## Flow

1. **Request**: `GET /url2pdf?url=https://example.com`
2. **Validation**: URL is validated (must be http or https)
3. **Cache check**: Worker looks up the URL key in R2 bucket
4. **Cache hit**: Returns the PDF bytes directly from R2
5. **Cache miss**: Worker creates a Workflow instance (idempotent via md5 URL hash)
6. **Workflow Step 1 (generate-pdf)**: Browser Rendering opens the URL, generates PDF, stores in R2 (with 3 retries, exponential backoff)
7. **Workflow Step 2 (verify-stored)**: Confirms the PDF exists in R2
8. **Response**: Returns `"Instance <id> is processing"` — client retries to fetch the cached PDF

## Deployment

Deployment is automated via CI: every push to `main` triggers `.github/workflows/deploy.yml`, which runs lint, typecheck, format check, and tests before deploying with `wrangler deploy`.

Manual deployment:

```sh
bun run deploy
```

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
│       ├── autofix.yml       # Auto-fix lint issues on PRs
│       ├── fallow.yml        # Code analysis
│       └── pinact.yml        # GitHub Actions pin verification
├── docs/
│   ├── usage.md          # Usage documentation
│   └── architecture.md   # This file
├── AGENTS.md             # AI agent instructions
├── wrangler.jsonc        # Cloudflare Worker configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies and scripts
```
