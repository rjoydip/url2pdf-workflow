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

### Unit and integration tests

```sh
bun run test        # Run all tests
bun run test:watch  # Watch mode
```

### Smoke test against a deployed instance

Set `DEPLOYED_URL` to the worker URL and run the integration tests against it:

```sh
DEPLOYED_URL=https://url2pdf.rjoydip.workers.dev bun test
```

The smoke tests confirm:

- `GET /` returns service metadata (200 + JSON body)
- `GET /url2pdf` without a URL returns 404
- `GET /url2pdf?url=<valid>` returns 200 (cached or processing)
- `GET /url2pdf?url=<invalid>` returns 500

### Manual testing with curl

```sh
# Check service metadata
curl https://url2pdf.rjoydip.workers.dev/
```

```sh
# Generate a PDF
curl "https://url2pdf.rjoydip.workers.dev/url2pdf?url=https://example.com" \
  --output example.pdf
```

```sh
# Check for errors on first request (Workflow may still be processing)
curl -w "\n%{http_code}\n" \
  "https://url2pdf.rjoydip.workers.dev/url2pdf?url=https://example.com"
# Response: "Instance <id> is processing" (200)
# Retry to get the cached PDF:
curl "https://url2pdf.rjoydip.workers.dev/url2pdf?url=https://example.com" \
  --output example.pdf
```

## API

### `GET /`

Returns service metadata as JSON.

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
    "/url2pdf?url=<url>": "Convert a URL to PDF"
  }
}
```

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
curl "https://url2pdf.rjoydip.workers.dev/url2pdf?url=https://example.com" \
  --output example.pdf
```

## Caching

Generated PDFs are cached in an R2 bucket using the URL as the key. Subsequent requests for the same URL first check the cache before creating a new Workflow instance.

## Prerequisites

- [Cloudflare Workers account](https://workers.cloudflare.com) with a [paid plan](https://developers.cloudflare.com/workers/platform/pricing/) (Browser Rendering requires Workers Paid)
- [R2 bucket](https://developers.cloudflare.com/r2/) named `url2pdf-bucket`
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated
- [Bun](https://bun.sh) >= 1.3
