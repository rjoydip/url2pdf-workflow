# Usage

## Development

```sh
bun install
bun run dev
```

## Deploy

```sh
bun run deploy
```

Deploy automatically via CI on push to `main` — see [deploy.yml](../.github/workflows/deploy.yml).

## Testing

```sh
bun run test        # Run all tests
bun run test:watch  # Watch mode
```

Smoke test a deployed instance:

```sh
DEPLOYED_URL=https://url2pdf.your-worker.workers.dev bun test
```

## API

### `GET /url2pdf?url=<url>`

Converts a URL to PDF.

| Param | Required | Description                                |
| ----- | -------- | ------------------------------------------ |
| `url` | Yes      | The URL to convert (must be http or https) |

**Responses**

| Status | Description                                                |
| ------ | ---------------------------------------------------------- |
| `200`  | PDF content (from cache or freshly generated via Workflow) |
| `404`  | Missing or invalid URL                                     |
| `500`  | Internal error (PDF generation failure, etc.)              |

### Example

```sh
curl "https://your-worker.example/url2pdf?url=https://example.com" --output example.pdf
```

## Caching

Generated PDFs are cached in an R2 bucket using the URL as the key. Subsequent requests for the same URL first check the cache before creating a new Workflow instance.

## Prerequisites

- [Cloudflare Workers account](https://workers.cloudflare.com) with a [paid plan](https://developers.cloudflare.com/workers/platform/pricing/) (Browser Rendering requires Workers Paid)
- [R2 bucket](https://developers.cloudflare.com/r2/) named `url2pdf-bucket`
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated
- [Bun](https://bun.sh) >= 1.3
