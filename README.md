# Ollama Cloud API

[![npm version](https://img.shields.io/npm/v/ollama-cloud-api.svg)](https://www.npmjs.com/package/ollama-cloud-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Extended metadata and discovery API for **Ollama Cloud models** (`:cloud`): real token pricing, numeric usage tiers, scraped benchmarks, task recommendations, and model comparisons.

## Quick Start

```bash
# Install globally
npm install -g ollama-cloud-api

# Run (requires Ollama on port 11434)
ollama-cloud-api

# Or run directly via npx
npx ollama-cloud-api
```

## Live Endpoints

- **Interactive API Documentation (Scalar)**: [https://ollama-cloud-api-4bbr.onrender.com/docs](https://ollama-cloud-api-4bbr.onrender.com/docs)
- **Catalog Overview & Tier Breakdown**: [`GET /api/overview`](https://ollama-cloud-api-4bbr.onrender.com/api/overview)
- **Grouped by Usage Tier**: [`GET /api/show-cloud?grouped=true`](https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?grouped=true)
- **Model Recommendations**: [`GET /api/recommend?task=coding&max_usage=2`](https://ollama-cloud-api-4bbr.onrender.com/api/recommend?task=coding&max_usage=2)
- **Ranked Leaderboards**: [`GET /api/leaderboard?category=Coding`](https://ollama-cloud-api-4bbr.onrender.com/api/leaderboard?category=Coding)
- **Head-to-Head Comparison**: [`GET /api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud`](https://ollama-cloud-api-4bbr.onrender.com/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud)

---

## Why This Exists: Official Ollama API vs. Ollama Cloud API

When querying a cloud model like `glm-5.3-flash:cloud`, the official Ollama API returns basic architecture details, but omits token pricing, usage tiers, speed profile, and provider attribution.

### Official Ollama API (`POST /api/show`)

```bash
curl -s http://localhost:11434/api/show -d '{"model": "glm-5.3-flash:cloud"}'
```

```json
{
  "details": {
    "parent_model": "glm-5.3-flash",
    "format": "",
    "family": "glm5_next",
    "families": null,
    "parameter_size": "321323031390",
    "quantization_level": "FP8"
  },
  "model_info": {
    "general.architecture": "glm5_next",
    "general.parameter_count": 321323031390,
    "glm5_next.context_length": 1048576,
    "glm5_next.embedding_length": 4096
  },
  "capabilities": ["completion", "thinking", "tools", "vision"],
  "modified_at": "2026-08-26T07:00:00-07:00"
}
```

### Ollama Cloud API (`GET /api/show-cloud?model=glm-5.3-flash:cloud`)

```bash
curl -s "http://localhost:11435/api/show-cloud?model=glm-5.3-flash:cloud"
```

```json
{
  "model": "glm-5.3-flash:cloud",
  "capabilities": ["completion", "thinking", "tools", "vision"],
  "details": {
    "parent_model": "glm-5.3-flash",
    "format": "",
    "family": "glm5_next",
    "families": null,
    "parameter_size": "321323031390",
    "quantization_level": "FP8"
  },
  "model_info": {
    "general.architecture": "glm5_next",
    "general.parameter_count": 321323031390,
    "glm5_next.context_length": 1048576,
    "glm5_next.embedding_length": 4096
  },
  "modified_at": "2026-08-26T07:00:00-07:00",
  "usage": 2,
  "usage_label": "Medium",
  "pricing": {
    "input": 0.15,
    "output": 0.5,
    "cached": 0.03
  },
  "provider": "Zhipu AI",
  "family": "glm5_next",
  "profile": "fast",
  "context_length": 1048576,
  "ollama_url": "https://ollama.com/library/glm-5.3-flash",
  "installed": true
}
```

**Added by Ollama Cloud API:**

- **Exact Token Pricing**: `$0.15` input, `$0.50` output, and `$0.03` cached per 1M tokens.
- **Usage Tier**: Numeric tier `2` and label `"Medium"`.
- **AI Lab Attribution**: `"provider": "Zhipu AI"`.
- **Speed Profile**: `"profile": "fast"` (distinguishing lightweight flash models from heavy pro models).
- **Direct Web Page Link**: `"ollama_url": "https://ollama.com/library/glm-5.3-flash"` linking to the official Ollama page.
- **Catalog Discovery**: Query, filter, and compare models even before pulling them locally.

---

## Features

- **Cloud Models Only**: `/api/show-cloud` filters catalog queries strictly to cloud models (`:cloud`).
- **Numeric Usage Tiers (1–4)**:
  - `1` = **Low**
  - `2` = **Medium**
  - `3` = **High**
  - `4` = **Extra High**
- **Pricing & Provider Attribution**: Exact input, output, and cached token pricing per 1M tokens, provider attribution (Moonshot, Zhipu, DeepSeek, Mistral, Nvidia, Google), and workload profile classification (fast, thinking, pro, general).
- **Usage Detection**: Tiers derived from scraped pricing or pre-seeded known model data.
- **Caching**: In-memory cache with 24-hour TTL and pre-seeded models for instant responses with zero network I/O.
- **CORS Support**: Permissive CORS enabled for web frontends and browser extensions.
- **OpenAPI 3.0**: Dynamic spec at `/openapi.json` derived from incoming host headers.
- **Interactive Docs**: Rendered with Scalar at `/docs`.
- **Docker Support**: Multi-architecture container images on GHCR.
- **Lightweight**: ESM TypeScript server using native Node.js HTTP with zero framework dependencies.

---

## Configuration

Set environment variables as needed:

| Variable             | Description                                                            | Default                  |
| -------------------- | ---------------------------------------------------------------------- | ------------------------ |
| `PORT`               | Server port                                                            | `11435`                  |
| `OLLAMA_HOST`        | Upstream Ollama URL                                                    | `http://localhost:11434` |
| `ENABLE_COMPLETIONS` | Allow `/api/chat` & `/api/generate` (disabled to protect host credits) | `false`                  |

Example:

```bash
PORT=3000 OLLAMA_HOST=http://ollama.internal:11434 ollama-cloud-api
```

---

## API Reference

### 1. `GET /` or `GET /health`

Health check and endpoint discovery.

```bash
curl https://ollama-cloud-api-4bbr.onrender.com/
# {
#   "status": "ok",
#   "service": "ollama-cloud-api",
#   "endpoints": ["/api/show-cloud", "/api/recommend", ...]
# }
```

### 2. `GET /api/overview`

Catalog inventory statistics, usage tier distributions, capability breakdown, provider breakdown, and benchmark coverage.

```bash
curl https://ollama-cloud-api-4bbr.onrender.com/api/overview
```

### 3. `GET /api/recommend`

Recommends the highest-performing cloud model for specific workloads (coding, agentic, vision, fast, cheap) within usage limits.

```bash
# Auto-select the best coding model under tier 3
curl "https://ollama-cloud-api-4bbr.onrender.com/api/recommend?task=coding&max_usage=3"
```

### 4. `GET /api/leaderboard`

Ranks cloud models by benchmark category (Coding, Agentic, Vision, etc.) based on benchmark scores.

```bash
curl "https://ollama-cloud-api-4bbr.onrender.com/api/leaderboard?category=Coding"
```

### 5. `GET /api/compare`

Side-by-side comparison of context length, active parameters, pricing, usage tiers, and benchmark scores.

```bash
curl "https://ollama-cloud-api-4bbr.onrender.com/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud"
```

### 6. `GET /api/show-cloud`

Returns full model details, pricing, provider info, capabilities, context length, benchmarks, and numeric `usage` (1–4). Supports filtering, sorting, summary metrics, and tier grouping.

```bash
# All cloud models
curl https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud

# Filter: Vision + Tools with Low/Medium usage sorted by lowest usage first
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?max_usage=2&capability=vision,tools&sort=usage"

# Models with benchmark comparisons included
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?benchmarks=true"

# Only models with available benchmark data
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?has_benchmarks=true"

# Filter by AI Provider (e.g. Moonshot, Zhipu, DeepSeek, Mistral, Nvidia, Google)
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?provider=moonshot"

# Filter by Speed / Workload Profile (fast, thinking, pro, general)
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?profile=fast"

# Grouped by usage tier
curl https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?grouped=true

# Combined with catalog summary statistics
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?summary=true"
```

### 7. Transparent Ollama Pass-Through & Credit Protection

When self-hosting with an upstream Ollama instance:

- **Metadata Passthrough**: Read-only metadata endpoints (`/api/tags`, `/api/show`, `/api/version`, `/api/ps`) are forwarded directly to upstream Ollama at zero credit cost.
- **Host Credit Protection**: All inference endpoints (`/api/chat`, `/api/generate`, `/api/embed`, `/api/embeddings`) are **disabled by default (403 Forbidden)** to ensure external callers cannot consume your Ollama Cloud credits.
- **Model Safety**: Mutating operations (`/api/pull`, `/api/delete`, etc.) and unknown routes are blocked.
- To allow inference completions through this proxy, set `ENABLE_COMPLETIONS=true`.

```bash
# Standard show (proxied to upstream Ollama)
curl http://localhost:11435/api/tags

# Chat completion (only active when ENABLE_COMPLETIONS=true)
curl -X POST http://localhost:11435/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

---

## Docker

```bash
docker run -p 11435:11435 ghcr.io/decheverri123/ollama-cloud-api:latest
```

## Programmatic Usage

```js
import { createServer } from "ollama-cloud-api";

const server = createServer();
server.listen(11435, () => {
  console.log("Ollama Cloud API running on port 11435");
});
```

## Development

```bash
# Install dependencies
pnpm install

# Development mode with hot reload
pnpm dev

# Build + typecheck
pnpm build

# Run built server
pnpm start
```

---

## License

MIT © Daniel Echeverri
