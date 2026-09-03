# Ollama Cloud API

[![npm version](https://img.shields.io/npm/v/ollama-cloud-api.svg)](https://www.npmjs.com/package/ollama-cloud-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The missing API for **Ollama Cloud models**: live numeric usage tiers, scraped benchmarks, task recommendations, comparisons, and leaderboards.

## 🚀 Quick Start

```bash
# Install
npm install -g ollama-cloud-api

# Run (requires Ollama running on default port 11434)
ollama-cloud-api

# Or use npx
npx ollama-cloud-api
```

## 🌐 Try it Live

- **Interactive API Documentation (Scalar)**: [https://ollama-cloud-api-4bbr.onrender.com/docs](https://ollama-cloud-api-4bbr.onrender.com/docs)
- **Catalog Overview & Tier Breakdown**: [`GET /api/overview`](https://ollama-cloud-api-4bbr.onrender.com/api/overview)
- **Grouped by Usage Tier**: [`GET /api/show-cloud?grouped=true`](https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?grouped=true)
- **Model Recommendations**: [`GET /api/recommend?task=coding&max_usage=2`](https://ollama-cloud-api-4bbr.onrender.com/api/recommend?task=coding&max_usage=2)

- **Ranked Leaderboards**: [`GET /api/leaderboard?category=Coding`](https://ollama-cloud-api-4bbr.onrender.com/api/leaderboard?category=Coding)
- **Head-to-Head Comparison**: [`GET /api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud`](https://ollama-cloud-api-4bbr.onrender.com/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud)

---

## ✨ Key Features

- **☁️ Cloud Models Only**: `/api/show-cloud` filters your library to only cloud models.
- **🔢 Numeric Usage Tiers (1–4)**:
  - `1` = **Low**
  - `2` = **Medium**
  - `3` = **High**
  - `4` = **Extra High**
- **📊 Usage Detection**: Tiers derived from live pricing scrape OR fall back to known model data
- **💾 Smart Caching**: 24-hour TTL with pre-cached known models (zero network for popular cloud models)
- **🌍 Full CORS**: Ready for web apps and browser extensions
- **📋 OpenAPI 3.0**: Auto-generated spec at `/openapi.json`
- **📚 Interactive Docs**: Powered by Scalar at `/docs`
- **🐳 Docker Ready**: Multi-arch images on GHCR
- **⚡ Lightweight**: Single-file ESM TypeScript server (~1500 lines core)

---

## 🔧 Configuration

Set environment variables as needed:

| Variable             | Description                                                           | Default                 |
|----------------------|-----------------------------------------------------------------------|-------------------------|
| `PORT`               | Server port                                                           | `11435`                 |
| `OLLAMA_HOST`        | Upstream Ollama URL                                                   | `http://localhost:11434`|
| `ENABLE_COMPLETIONS` | Allow `/api/chat` & `/api/generate` (disabled to protect host credits)| `false`                 |

Example:
```bash
PORT=3000 OLLAMA_HOST=http://ollama.internal:11434 ollama-cloud-api
```

---

## 📖 API Reference

### 1. `GET /` or `GET /health`
Health check and API discovery.

```bash
curl https://ollama-cloud-api-4bbr.onrender.com/
# {
#   "status": "ok",
#   "service": "ollama-cloud-api",
#   "endpoints": ["/api/show-cloud", "/api/recommend", ...]
# }
```

### 2. `GET /api/overview` (Catalog Analytics)
High-level inventory dashboard covering usage distributions, capability counts, and benchmark coverage.

```bash
curl https://ollama-cloud-api-4bbr.onrender.com/api/overview
```

### 3. `GET /api/recommend` (Smart Task Router)
Recommends the highest-performing cloud model for tasks (coding, agentic, vision, fast, cheap) within usage limits.

```bash
# Auto-select the best coding model under tier 3
curl "https://ollama-cloud-api-4bbr.onrender.com/api/recommend?task=coding&max_usage=3"
```

### 4. `GET /api/leaderboard` (Ranked Leaderboards)
Ranks all cloud models by benchmark category (Coding, Agentic, Vision, plus others) based on scraped benchmark averages.

```bash
curl "https://ollama-cloud-api-4bbr.onrender.com/api/leaderboard?category=Coding"
```

### 5. `GET /api/compare` (Head-to-Head Comparison)
Side-by-side diff of context length, active parameters, usage tiers, and benchmark scores between models.

```bash
curl "https://ollama-cloud-api-4bbr.onrender.com/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud"
```

### 6. `GET /api/show-cloud` (Cloud Model Details & Benchmarks)
Returns full model details (parameters, template, capabilities, model_info), benchmarks, and numeric `usage` (1–4) for cloud models. Supports filtering, sorting, summary metrics, and grouping.

```bash
# All cloud models
curl https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud
# Local: curl http://localhost:11435/api/show-cloud

# Filter: Vision + Tools with Low/Medium usage sorted by lowest usage first
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?max_usage=2&capability=vision,tools&sort=usage"

# Models with benchmark comparisons included
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?benchmarks=true"

# Only models with available benchmark data
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?has_benchmarks=true"

# Grouped by usage tier
curl https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?grouped=true

# Combined with catalog summary statistics
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?summary=true"
```

### 7. Transparent Ollama Pass-Through & Credit Protection

When self-hosting with an upstream Ollama instance:
- **Metadata Passthrough**: Read-only metadata endpoints (`/api/tags`, `/api/show`, `/api/version`, `/api/ps`) are forwarded directly to upstream Ollama at zero credit cost.
- **Host Credit Protection**: All inference endpoints (`/api/chat`, `/api/generate`, `/api/embed`, `/api/embeddings`) are **disabled by default (403 Forbidden)** to ensure no external callers can consume your Ollama Cloud credits.
- **Model Safety**: Mutating operations (`/api/pull`, `/api/delete`, etc.) and unknown routes are blocked.
- To explicitly allow inference completions through this proxy, set `ENABLE_COMPLETIONS=true`.

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

## 🐳 Docker Usage

```bash
docker run -p 11435:11435 ghcr.io/decheverri123/ollama-cloud-api:latest
```

## 📦 Direct Import (ESM)
```js
import { createServer } from "ollama-cloud-api";

const server = createServer();
server.listen(11435, () => {
  console.log("Ollama Cloud API running on port 11435");
});
```

## 🔧 Development

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

## 📄 License

MIT © 2024 Ollama Cloud API
