# 🦙 ollama-usage-proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Docker Support](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Interactive Docs](https://img.shields.io/badge/Docs-Scalar-blueviolet.svg)](http://localhost:11435/docs)

A high-performance Node.js/TypeScript proxy for the [Ollama](https://ollama.com) API that enriches and manages your **Ollama Cloud models** with live numeric usage tiers (`1`–`4`), benchmark tables, smart task recommendations, head-to-head model comparisons, ranked leaderboards, and interactive web documentation powered by **Scalar**.

All standard Ollama endpoints (`/api/show`, `/api/tags`, `/api/generate`, `/api/chat`, `/api/version`) are forwarded transparently to your upstream Ollama server.

---

## ⚡ Quick Start

### 1. Run instantly with `npx` (No installation needed)

```bash
npx ollama-usage-proxy
```

### 2. Run with Docker

```bash
# Using Docker
docker run -d \
  --name ollama-usage-proxy \
  -p 11435:11435 \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/your-username/ollama-usage-proxy:latest

# Or using Docker Compose
docker compose up -d
```

### 3. Clone & Run with `pnpm`

```bash
git clone https://github.com/your-username/ollama-usage-proxy.git
cd ollama-usage-proxy
pnpm install
pnpm build
pnpm start
```

---

## 📚 Interactive API Documentation (Scalar)

Open **[http://localhost:11435/docs](http://localhost:11435/docs)** in your browser for a live, interactive API documentation portal powered by **Scalar** (with OpenAPI 3.1 specification at `/openapi.json`).

---

## ✨ Key Features

- **☁️ Cloud Models Only**: `/api/show-cloud` and `/api/tags-cloud` filter your library to only cloud models.
- **🔢 Numeric Usage Tiers (1–4)**:
  - `1` = **Low**
  - `2` = **Medium**
  - `3` = **High**
  - `4` = **Extra High**
- **🎯 Smart Task Router (`/api/recommend`)**: Recommends the highest-performing cloud model for tasks (coding, agentic, vision, fast, cheap) within usage limits.
- **🏆 Ranked Leaderboards (`/api/leaderboard`)**: Ranks all cloud models by domain (Coding, Agentic, Vision, Math) based on scraped benchmark averages.
- **⚖️ Head-to-Head Comparison (`/api/compare`)**: Side-by-side diff of context length, active parameters, usage tiers, and benchmark scores between models.
- **📊 Catalog Analytics (`/api/overview`)**: High-level inventory dashboard covering usage distributions, capability counts, and benchmark coverage.
- **📈 Scraped Benchmarks (`/api/benchmarks`)**: Scrapes live benchmark comparison tables from Ollama's library pages.
- **🗂 Tier Grouping (`/api/show-cloud/grouped`)**: Organize models directly by usage category (`1_low`, `2_medium`, `3_high`, `4_extra_high`).
- **⚡ Lightweight Tags (`/api/tags-cloud`)**: Fast tags-compatible endpoint with `usage` tier for UI dropdowns & extensions.
- **🔍 Query Filters & Sorting**: Filter by `usage`, `max_usage`, `min_usage`, `capability` (e.g. `tools,vision`), and sort by `usage`, `name`, or `size`.
- **🏃 Process Monitoring (`/api/ps-cloud`)**: Check running cloud models with active usage tiers.
- **⚡ In-Memory Caching & Cache Controls**: 10-minute TTL with `/api/cache/status` and `/api/cache/clear`.
- **🌐 Full CORS Support**: Pre-configured headers for web apps and browser extensions.

---

## ⚙️ Configuration

You can configure the proxy using environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Port on which the proxy server will listen | `11435` |
| `OLLAMA_HOST` | URL of the upstream Ollama instance | `http://localhost:11434` |

Example:

```bash
PORT=8080 OLLAMA_HOST=http://192.168.1.100:11434 npx ollama-usage-proxy
```

---

## 🔄 Running as a Background Daemon (macOS LaunchAgent)

To run the proxy permanently as a background service on macOS that automatically launches on login and restarts on failure:

### 1. Build the project

```bash
pnpm build
```

### 2. Create the LaunchAgent Plist

Save the following file to `~/Library/LaunchAgents/com.user.ollama-usage-proxy.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.ollama-usage-proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>/path/to/ollama-usage-proxy/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/ollama-usage-proxy</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ollama-usage-proxy.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ollama-usage-proxy.error.log</string>
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
launchctl load -w ~/Library/LaunchAgents/com.user.ollama-usage-proxy.plist
```

---

## 📖 API Endpoints Reference

### 1. `GET /api/recommend` (Smart Model Recommendation)

Recommends the best cloud model for tasks based on benchmark scores, capabilities, and usage constraints.

```bash
# Best coding model with Low/Medium usage (tier <= 2)
curl "http://localhost:11435/api/recommend?task=coding&max_usage=2"

# Best vision model with tool calling
curl "http://localhost:11435/api/recommend?task=vision&capability=tools"
```

#### Example Response

```json
{
  "task": "coding",
  "max_usage": 2,
  "recommendation": "glm-5.3-flash:cloud",
  "usage_tier": 2,
  "score": 163,
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
      "usage": 1,
      "score": 105,
      "reason": "Supports coding with capabilities [completion, thinking, tools, vision] at tier 1"
    }
  ]
}
```

---

### 2. `GET /api/leaderboard` (Ranked Benchmarks Leaderboard)

Ranks all models by category based on benchmark scores.

```bash
# Full leaderboard across all domains
curl http://localhost:11435/api/leaderboard

# Coding domain only
curl "http://localhost:11435/api/leaderboard?category=Coding"
```

---

### 3. `GET /api/compare` (Head-to-Head Comparison)

Compares two or more models side-by-side.

```bash
curl "http://localhost:11435/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud"
```

---

### 4. `GET /api/overview` (Catalog Analytics & Inventory)

Dashboard metrics covering tier distributions, capabilities, 1M context counts, and benchmark coverage.

```bash
curl http://localhost:11435/api/overview
```

---

### 5. `GET /api/show-cloud` (Full Cloud Model Details)

Returns full model details (parameters, template, capabilities, model_info) and numeric `usage` (1–4) for cloud models.

```bash
# All cloud models
curl http://localhost:11435/api/show-cloud

# Filter: Vision + Tools with Low/Medium usage sorted by lowest usage first
curl "http://localhost:11435/api/show-cloud?max_usage=2&capability=vision,tools&sort=usage"
```

---

### 6. `GET /api/benchmarks` (Model Benchmarks)

Scrapes and extracts benchmark comparison tables (Coding, Agentic, Vision, Math) from the model's Ollama library page.

```bash
# Specific model
curl "http://localhost:11435/api/benchmarks?model=glm-5.3-flash:cloud"

# All cloud models with benchmarks
curl http://localhost:11435/api/benchmarks
```

---

### 7. `GET /api/show-cloud/grouped` (Grouped by Tier)

Groups cloud models into categories: `1_low`, `2_medium`, `3_high`, `4_extra_high`.

```bash
curl http://localhost:11435/api/show-cloud/grouped
```

---

### 8. `GET /api/tags-cloud` (Lightweight Cloud Tags)

Returns lightweight tag records identical to `/api/tags`, enriched with `usage` tier. Supports filtering and sorting parameters.

```bash
curl http://localhost:11435/api/tags-cloud
```

---

### 9. `GET /api/ps-cloud` (Running Cloud Models)

Lists currently loaded / running cloud models with their active usage tier.

```bash
curl http://localhost:11435/api/ps-cloud
```

---

### 10. Cache Management

#### Cache Status (`GET /api/cache/status`)

Inspect cached usage & benchmark entries, ages, and remaining TTL.

```bash
curl http://localhost:11435/api/cache/status
```

#### Clear Cache (`POST /api/cache/clear`)

Flush both usage and benchmark caches immediately.

```bash
curl -X POST http://localhost:11435/api/cache/clear
```

---

### 11. Transparent Ollama Pass-Through

All standard Ollama endpoints are forwarded directly:

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

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/your-username/ollama-usage-proxy/issues).

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
