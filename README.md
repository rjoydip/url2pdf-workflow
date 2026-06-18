# url2pdf-workflow

[![License](https://img.shields.io/github/license/rjoydip/url2pdf-workflow)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0+-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3+-green)](https://bun.sh)
[![Fallow Health](.artifacts/fallow-badge.svg)](https://docs.fallow.tools/)
[![CI](https://github.com/rjoydip/url2pdf-workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/rjoydip/url2pdf-workflow/actions/workflows/ci.yml)

Convert URLs to PDFs using Cloudflare Browser Rendering.

## Quick start

```sh
bun install
bun run dev
```

Deploy:

```sh
bun run deploy
```

## Documentation

- [Usage](docs/usage.md) — API reference, examples, caching, prerequisites
- [Architecture](docs/architecture.md) — System design, flow, Cloudflare resources

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
