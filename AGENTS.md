# AGENTS.md

Single-package ESM TypeScript server (Node >= 18, built with pnpm 10). No test framework, no linter.

## Commands

- Dev with hot reload: `pnpm dev` (tsx watch src/index.ts)
- Build + typecheck (strict): `pnpm build` (`tsc` -> `dist/`)
- Run built server: `pnpm start`
- No test/lint scripts exist. Verification = `pnpm build` passes, then optionally boot smoke: `node dist/index.js & sleep 2 && kill $!`

## Critical: `dist/` is committed

`.gitignore` lists `dist/`, but `dist/index.js` is force-tracked on purpose: the npm `bin` and the package `files: ["dist"]` run straight from it. After any change to `src/index.ts`, run `pnpm build` and commit the regenerated `dist/index.js` too, or npm/Docker ships stale code. Keep `src` and `dist` in sync in every commit.

## Architecture

- `src/index.ts` (~2500 lines) is the whole app: HTTP server, URL scraping from ollama.com, in-memory caches, OpenAPI spec, and all route handling in one file. `src/benchmarks-data.ts` holds pre-cached benchmark tables (`KNOWN_MODEL_BENCHMARKS`).
- NodeNext ESM: relative imports must keep the `.js` extension (`import ... from "./benchmarks-data.js"`). Do not "fix" this to `.ts`.
- Exported functions/maps are effectively unit-test targets but nothing tests them.
- OpenAPI spec at `/openapi.json` derives its server URL dynamically from request headers (`x-forwarded-host`), and `/docs` renders Scalar.

## Data & conventions

- Usage tier is 1=Low, 2=Medium, 3=High, 4=Extra High. `calculateTierFromPricing()` (cost thresholds) and `parseUsageLevel()` (strings) both map to it.
- Cloud model tags end in `:cloud`. Detection is loose: `isCloudModel()` treats names ending *or containing* `:cloud` as cloud. Benchmarks seeded under both `name` and `name:cloud` keys; tier maps (`KNOWN_MODEL_TIERS`) use bare names.
- All caches are in-memory Maps seeded at startup from `KNOWN_MODEL_TIERS` and `KNOWN_MODEL_BENCHMARKS`, then refreshed by live scraping with a 24h TTL. Seeded values make most "cloud" endpoints work with zero network I/O. `POST /api/cache/clear` resets to the seed data.

## Runtime behavior

- Env vars: `PORT` (default `11435`), `OLLAMA_HOST` (default `http://localhost:11434`).
- Passthrough endpoints (`/api/chat`, `/api/show`, `/api/tags`, `/api/ps`, `/api/generate`, plus any unknown `/api/*`) require a running upstream Ollama.
- Cloud-specific endpoints (`/api/recommend`, `/api/leaderboard`, `/api/compare`, `/api/overview`, `/api/benchmarks`, `/api/tags-cloud`, `/api/show-cloud[/grouped]`, `/api/ps-cloud`, cache endpoints) work standalone from seed data + scraping.

## CI / release

- CI (github workflows): pnpm install, `pnpm build`, smoke-run the binary. Docker builds multi-arch and publishes to `ghcr.io/decheverri123/ollama-cloud-api`. Pushing a `v*` tag triggers GitHub release + `pnpm publish --no-git-checks`.
- `pnpm-workspace.yaml` whitelists `esbuild` build scripts; the Dockerfile also sets `pnpm config set ignore-scripts true` before installing.

## Docs

README.md is the live API reference (endpoints, curl examples, config) and is kept aligned with the implementation — update it when routes or response shapes change.