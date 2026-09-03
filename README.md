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
- **Grouped by Usage Tier**: [`GET /api/show-cloud/grouped`](https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud/grouped)
- **Model Recommendations**: [`GET /api/recommend?task=coding&max_usage=2`](https://ollama-cloud-api-4bbr.onrender.com/api/recommend?task=coding&max_usage=2)

- **Ranked Leaderboards**: [`GET /api/leaderboard?category=Coding`](https://ollama-cloud-api-4bbr.onrender.com/api/leaderboard?category=Coding)
- **Head-to-Head Comparison**: [`GET /api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud`](https://ollama-cloud-api-4bbr.onrender.com/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud)

---

## ✨ Key Features

- **☁️ Cloud Models Only**: `/api/show-cloud` and `/api/tags-cloud` filter your library to only cloud models.
- **🔢 Numeric Usage Tiers (1–4)**:
  - `1` = **Low**
  - `2` = **Medium**
  - `3` = **High**
  - `4` = **Extra High**
- **📊 Usage Detection**: Tiers derived from live pricing scrape OR fall back to known model data
- **💾 Smart Caching**: 24-hour TTL with pre-cached known models (zero network for popular cloud models)
- **🔄 Cache Control**: `/api/cache/status` and `/api/cache/clear` endpoints
- **🌍 Full CORS**: Ready for web apps and browser extensions
- **📋 OpenAPI 3.0**: Auto-generated spec at `/openapi.json`
- **📚 Interactive Docs**: Powered by Scalar at `/docs`
- **🐳 Docker Ready**: Multi-arch images on GHCR
- **⚡ Lightweight**: Single-file ESM TypeScript server (~1500 lines core)

---

## 🔧 Configuration

Set environment variables as needed:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `11435` |
| `OLLAMA_HOST` | Upstream Ollama URL | `http://localhost:11434` |

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

### 6. `GET /api/benchmarks` (Model Benchmarks)
Scrapes and extracts benchmark comparison tables from the model's Ollama library page.

```bash
# Specific model
curl "https://ollama-cloud-api-4bbr.onrender.com/api/benchmarks?model=glm-5.3-flash:cloud"

# All models with benchmarks
curl https://ollama-cloud-api-4bbr.onrender.com/api/benchmarks
```

### 7. `GET /api/show-cloud` (Cloud Model Details)
**Consolidated endpoint**: Returns cloud model details. Response format varies based on which endpoint you call:

- **`/api/show-cloud`** → Full model details (parameters, template, capabilities, model_info)  
- **`/api/tags-cloud`** → Lightweight tag format optimized for UI dropdowns & extensions  

Both endpoints support the same query parameters for filtering, sorting, and grouping.

```bash
# Full details (show-cloud endpoint)
curl https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud

# Lightweight tags (tags-cloud endpoint)  
curl https://ollama-cloud-api-4bbr.onrender.com/api/tags-cloud

# Optional query parameters:
#   - usage, max_usage, min_usage (filter by numeric tier 1-4)
#   - capability (comma-separated: completion,thinking,tools,vision)
#   - installed=true|false (filter by local install status)
#   - sort=usage|name|size|usage_asc|usage_desc|name_asc|name_desc
#   - grouped=true (group response by usage tier)
#   - benchmarks=true (include benchmark data for show-cloud only)

# Examples:
# Vision models with low/medium usage, sorted by name
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?max_usage=2&capability=vision&sort=name"

# Tag format for tools-capable models
curl "https://ollama-cloud-api-4bbr.onrender.com/api/tags-cloud?capability=tools"

# Grouped by tier (works with both endpoints)
curl https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud/grouped
curl https://ollama-cloud-api-4bbr.onrender.com/api/tags-cloud/grouped

# Include benchmarks (show-cloud endpoint only)
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?model=glm-5.3-flash:cloud&benchmarks=true"
```

### 8. `GET /api/ps-cloud` (Running Cloud Models)
Check running cloud models with active usage tiers.

```bash
curl https://ollama-cloud-api-4bbr.onrender.com/api/ps-cloud
```

### 9. `POST /api/cache/status`
Check cache status and TTL information.

```bash
curl -X POST https://ollama-cloud-api-4bbr.onrender.com/api/cache/status
```

### 10. `POST /api/cache/clear`
Reset caches to seed data (useful for development/testing).

```bash
curl -X POST https://ollama-cloud-api-4bbr.onrender.com/api/cache/clear
```

### 11. Transparent Ollama Pass-Through
When self-hosting with an upstream Ollama instance, all standard Ollama endpoints are forwarded directly:
- `/api/tags`, `/api/show`, `/api/version`
- `/api/chat`, `/api/generate` (standard Ollama behavior - no cloud-aware features)

```bash
# Standard show (proxied to upstream Ollama)
curl http://localhost:11435/api/tags

# Standard chat (proxied to upstream Ollama)
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

---

**Note**: The `/api/show-cloud` and `/api/tags-cloud` endpoints have been consolidated under a shared implementation for improved maintainability, but retain their distinct response formats and URLs for backward compatibility.
