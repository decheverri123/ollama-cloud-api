# 🦙 ollama-cloud-api

[![Live API](https://img.shields.io/badge/Live%20API-Render-46E3B7.svg?style=flat&logo=render)](https://ollama-cloud-api-4bbr.onrender.com)
[![Interactive Docs](https://img.shields.io/badge/Docs-Scalar-blueviolet.svg)](https://ollama-cloud-api-4bbr.onrender.com/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Docker Support](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

The missing API for **Ollama Cloud models**: live numeric usage tiers (`1`–`4`), benchmark tables, smart task recommendations, head-to-head model comparisons, ranked leaderboards, and interactive web documentation powered by **Scalar**.

🌐 **Live API**: [https://ollama-cloud-api-4bbr.onrender.com](https://ollama-cloud-api-4bbr.onrender.com)  
📚 **Live Interactive Docs**: [https://ollama-cloud-api-4bbr.onrender.com/docs](https://ollama-cloud-api-4bbr.onrender.com/docs)  
📑 **Live OpenAPI Spec**: [https://ollama-cloud-api-4bbr.onrender.com/openapi.json](https://ollama-cloud-api-4bbr.onrender.com/openapi.json)

All standard Ollama endpoints are forwarded transparently to your upstream Ollama server when self-hosting. Note: the cloud-aware chat and generate endpoints have been removed, so `/api/chat` and `/api/generate` now behave as standard pass-through endpoints.

---

## 🚀 Live Demo & Interactive Docs

Try the API directly without installing anything:

- **Interactive API Documentation (Scalar)**: [https://ollama-cloud-api-4bbr.onrender.com/docs](https://ollama-cloud-api-4bbr.onrender.com/docs)
- **Catalog Overview & Tier Breakdown**: [`GET /api/overview`](https://ollama-cloud-api-4bbr.onrender.com/api/overview)
- **Grouped by Usage Tier**: [`GET /api/show-cloud/grouped`](https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud/grouped)
- **Model Recommendations**: [`GET /api/recommend?task=coding&max_usage=2`](https://ollama-cloud-api-4bbr.onrender.com/api/recommend?task=coding&max_usage=2)

- **Ranked Leaderboards**: [`GET /api/leaderboard?category=Coding`](https://ollama-cloud-api-4bbr.onrender.com/api/leaderboard?category=Coding)
- **Head-to-Head Comparison**: [`GET /api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud`](https://ollama-cloud-api-4bbr.onrender.com/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud)

---

## ⚡ Self-Hosting Quick Start

### 1. Run instantly with `npx` (No install needed)

```bash
npx ollama-cloud-api
```

### 2. Run with Docker

```bash
# Using Docker
docker run -d \
  --name ollama-cloud-api \
  -p 11435:11435 \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/decheverri123/ollama-cloud-api:latest

# Or using Docker Compose
docker compose up -d
```

### 3. Clone & Run with `pnpm`

```bash
git clone https://github.com/decheverri123/ollama-cloud-api.git
cd ollama-cloud-api
pnpm install
pnpm build
pnpm start
```

---

## 📚 Interactive API Documentation (Scalar)

Open **[https://ollama-cloud-api-4bbr.onrender.com/docs](https://ollama-cloud-api-4bbr.onrender.com/docs)** (or `http://localhost:11435/docs` when self-hosting) in your browser for a live, interactive API documentation portal powered by **Scalar** (with OpenAPI 3.1 specification at `/openapi.json`).

---

## ✨ Key Features

- **☁️ Cloud Models Only**: `/api/show-cloud` and `/api/tags-cloud` filter your library to only cloud models.
- **🔢 Numeric Usage Tiers (1–4)**:
  - `1` = **Low**
  - `2` = **Medium**
  - `3` = **High**
  - `4` = **Extra High**
- **🎯 Smart Task Router (`/api/recommend`)**: Recommends the highest-performing cloud model for tasks (coding, agentic, vision, fast, cheap) within usage limits.

- **🏆 Ranked Leaderboards (`/api/leaderboard`)**: Ranks all cloud models by benchmark category (Coding, Agentic, Vision, plus others) based on scraped benchmark averages.
- **⚖️ Head-to-Head Comparison (`/api/compare`)**: Side-by-side diff of context length, active parameters, usage tiers, and benchmark scores between models.
- **📊 Catalog Analytics (`/api/overview`)**: High-level inventory dashboard covering usage distributions, capability counts, and benchmark coverage.
- **📈 Scraped Benchmarks (`/api/benchmarks`)**: Scrapes live benchmark comparison tables from Ollama's library pages.
- **🗂 Tier Grouping (`/api/show-cloud/grouped`)**: Organize models directly by usage category (`1_low`, `2_medium`, `3_high`, `4_extra_high`).
- **⚡ Lightweight Tags (`/api/tags-cloud`)**: Fast tags-compatible endpoint with `usage` tier for UI dropdowns & extensions.
- **🔍 Query Filters & Sorting**: Filter by `usage`, `max_usage`, `min_usage`, `capability` (e.g. `tools,vision`), and sort by `usage`, `name`, or `size`.
- **🏃 Process Monitoring (`/api/ps-cloud`)**: Check running cloud models with active usage tiers.
- **⚡ Pre-Cached Datasets & Long-Lived Caching**: 24-hour cache with zero-latency pre-cached known tiers and benchmarks, with `/api/cache/status` and `/api/cache/clear`.
- **🌐 Full CORS Support**: Pre-configured headers for web apps and browser extensions.

---

## ⚙️ Configuration

Configure the service using standard environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Port on which the API server will listen | `11435` |
| `OLLAMA_HOST` | URL of the upstream Ollama instance | `http://localhost:11434` |

Example:

```bash
PORT=8080 OLLAMA_HOST=http://192.168.1.100:11434 npx ollama-cloud-api
```

---

## 🔄 Running as a Background Daemon (macOS LaunchAgent)

To run the proxy permanently as a background service on macOS that automatically launches on login and restarts on failure:

### 1. Build the project

```bash
pnpm build
```

### 2. Create the LaunchAgent Plist

Save the following file to `~/Library/LaunchAgents/com.user.ollama-cloud-api.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.ollama-cloud-api</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/ollama-cloud-api/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/ollama-cloud-api</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ollama-cloud-api.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ollama-cloud-api.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>11435</string>
        <key>OLLAMA_HOST</key>
        <string>http://localhost:11434</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
```

### 3. Load & Start the Service

```bash
launchctl load -w ~/Library/LaunchAgents/com.user.ollama-cloud-api.plist
```

---

## 📖 API Endpoints Reference

### 1. `GET /api/recommend` (Smart Model Recommendation)

Recommends the best cloud model for tasks based on benchmark scores, capabilities, and usage constraints. The same engine is also available via `POST /api/recommend` with a JSON body.

```bash
# Best coding model with Low/Medium usage (tier <= 2)
curl "https://ollama-cloud-api-4bbr.onrender.com/api/recommend?task=coding&max_usage=2"
# Local: curl "http://localhost:11435/api/recommend?task=coding&max_usage=2"

# Best vision model with tool calling
curl "https://ollama-cloud-api-4bbr.onrender.com/api/recommend?task=vision&capability=tools"

# POST with JSON body
curl -X POST https://ollama-cloud-api-4bbr.onrender.com/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"task": "coding", "max_usage": 2, "capability": "tools"}'
```

#### Example Response

```json
{
  "task": "coding",
  "max_usage": 2,
  "recommendation": "glm-5.3-flash:cloud",
  "installed": false,
  "pull_command": "ollama pull glm-5.3-flash:cloud",
  "usage_tier": 1,
  "score": 148,
  "reason": "High coding benchmark average of 68% on 3 coding benchmarks",
  "capabilities": [
    "completion",
    "thinking",
    "tools",
    "vision"
  ],
  "alternatives": [
    {
      "model": "gemma4:cloud",
      "installed": false,
      "pull_command": "ollama pull gemma4:cloud",
      "usage": 1,
      "score": 80,
      "reason": "Supports coding with capabilities [completion, thinking, tools, vision] at tier 1"
    }
  ]
}
```

---

---



---

### 3. `GET /api/leaderboard` (Ranked Benchmarks Leaderboard)

Ranks all models by category based on benchmark scores.

```bash
# Full leaderboard across all domains
curl https://ollama-cloud-api-4bbr.onrender.com/api/leaderboard
# Local: curl http://localhost:11435/api/leaderboard

# Coding domain only
curl "https://ollama-cloud-api-4bbr.onrender.com/api/leaderboard?category=Coding"
```

---

### 4. `GET /api/compare` (Head-to-Head Comparison)

Compares two or more models side-by-side.

```bash
curl "https://ollama-cloud-api-4bbr.onrender.com/api/compare?models=glm-5.3-flash:cloud,deepseek-v4-flash:cloud"
# Local: curl "http://localhost:11435/api/compare?models=glm-5.3-flash:cloud,deepseek-v4-flash:cloud"
```

---

### 5. `GET /api/overview` (Catalog Analytics & Inventory)

Dashboard metrics covering tier distributions, capabilities, 1M context counts, and benchmark coverage.

```bash
curl https://ollama-cloud-api-4bbr.onrender.com/api/overview
# Local: curl http://localhost:11435/api/overview
```

---

### 6. `GET /api/show-cloud` (Full Cloud Model Details)

Returns full model details (parameters, template, capabilities, model_info) and numeric `usage` (1–4) for cloud models.

```bash
# All cloud models
curl https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud
# Local: curl http://localhost:11435/api/show-cloud

# Filter: Vision + Tools with Low/Medium usage sorted by lowest usage first
curl "https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud?max_usage=2&capability=vision,tools&sort=usage"
```

---

### 7. `GET /api/benchmarks` (Model Benchmarks)

Scrapes and extracts benchmark comparison tables (Coding, Agentic, Vision, and others) from the model's Ollama library page.

```bash
# Specific model
curl "https://ollama-cloud-api-4bbr.onrender.com/api/benchmarks?model=glm-5.3-flash:cloud"

# All cloud models with benchmarks
curl https://ollama-cloud-api-4bbr.onrender.com/api/benchmarks
```

---

### 8. `GET /api/show-cloud/grouped` (Grouped by Tier)

Groups cloud models into categories: `1_low`, `2_medium`, `3_high`, `4_extra_high`.

```bash
curl https://ollama-cloud-api-4bbr.onrender.com/api/show-cloud/grouped
# Local: curl http://localhost:11435/api/show-cloud/grouped
```

---

### 9. `GET /api/tags-cloud` (Lightweight Cloud Tags)

Returns lightweight tag records identical to `/api/tags`, enriched with `usage` tier. Supports filtering and sorting parameters.

```bash
curl https://ollama-cloud-api-4bbr.onrender.com/api/tags-cloud
# Local: curl http://localhost:11435/api/tags-cloud
```

---

### 10. `GET /api/ps-cloud` (Running Cloud Models)

Lists currently loaded / running cloud models with their active usage tier.

```bash
curl http://localhost:11435/api/ps-cloud
```

---

### 11. Cache Management

#### Cache Status (`GET /api/cache/status`)

Inspect cached usage & benchmark entries, ages, and remaining TTL.

```bash
curl https://ollama-cloud-api-4bbr.onrender.com/api/cache/status
# Local: curl http://localhost:11435/api/cache/status
```

#### Clear Cache (`POST /api/cache/clear`)

Flush both usage and benchmark caches immediately.

```bash
curl -X POST https://ollama-cloud-api-4bbr.onrender.com/api/cache/clear
# Local: curl -X POST http://localhost:11435/api/cache/clear
```

---

### 12. Transparent Ollama Pass-Through

When self-hosting with an upstream Ollama instance, all standard Ollama endpoints are forwarded directly. Note: the cloud-aware chat and generate endpoints have been removed, so `/api/chat` and `/api/generate` now behave as standard pass-through endpoints.

```bash
# Standard show
curl http://localhost:11435/api/show -d '{"model": "qwen2.5-coder:7b"}'

# List all local & cloud models
curl http://localhost:11435/api/tags

# Generate completion
curl http://localhost:11435/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-5.3-flash:cloud", "prompt": "Hello!"}'
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a PR.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
