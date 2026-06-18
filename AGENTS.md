# AGENTS.md

This file provides instructions for AI coding agents working on this project.

## Project overview

A Cloudflare Worker that converts URLs to PDFs using Cloudflare Browser Rendering. The worker accepts a URL via query parameter, renders the page using a remote browser, and returns the PDF — with R2 caching for subsequent requests.

## Tech stack

- **Runtime**: Cloudflare Workers (workerd)
- **Framework**: Hono
- **Language**: TypeScript
- **Linting**: oxlint
- **Formatting**: oxfmt
- **Testing**: bun test
- **Git hooks**: simple-git-hooks
- **CI**: GitHub Actions

## Commands

```sh
bun run dev          # Start local dev server
bun run deploy       # Deploy to Cloudflare Workers
bun run test         # Run tests with bun
bun run test:watch   # Run tests in watch mode
bun run lint         # Lint with oxlint
bun run lint:fix     # Lint and fix + format
bun run format       # Format with oxfmt
bun run format:check # Check formatting
bun run typecheck    # Type-check with tsc --noEmit
bun run fallow       # Run fallow analysis
```

## Code conventions

- **Imports**: Use `import` syntax (ESM). No `require`.
- **Types**: Define interfaces locally in the file when simple; extract to types file when shared.
- **Exports**: Default export the Hono app for the Worker entry point.
- **Formatting**: Use `bun run format` before committing. oxfmt handles all formatting.
- **No JSX** in this project.

## Workflow

1. Edit source files under `src/`
2. Run `bun run test` to verify tests pass
3. Run `bun run lint` and `bun run format` to check
4. Run `bun run typecheck` to verify types
5. Commit — pre-commit hook runs `lint:fix`, format check, and typecheck automatically

## Testing patterns

- **Unit tests** in `*.test.ts` files co-located with source — mock `cloudflare:workers` and `hono/utils/crypto` in `beforeAll`.
- **Integration tests** in `src/integration.test.ts` — test full request lifecycle through the Hono app.
- **Deployment smoke tests** — set `DEPLOYED_URL` env var to run smoke tests against a live endpoint: `DEPLOYED_URL=https://url2pdf.xyz.workers.dev bun test`

## CI/CD

GitHub Actions runs on push/PR to `main`:

- `ci.yml` — lint, typecheck, format check, tests
- `deploy.yml` — test + lint + deploy to Cloudflare Workers
- `autofix.yml` — auto-fix lint issues on PRs
- `fallow.yml` — code analysis on PRs
- `pinact.yml` — verify GitHub Action pins are immutable
