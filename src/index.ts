#!/usr/bin/env node
import http from "http";
import { URL } from "url";
import { PORT, OLLAMA_HOST } from "./config.js";
import { getOpenApiSpecWithHost, renderDocsHtml } from "./openapi.js";
import { readBody, sendJson, sendError } from "./utils/http.js";

import { handleShowCloud, handleShowCloudAll } from "./routes/show-cloud.js";
import { handleRecommend } from "./routes/recommend.js";
import { handleLeaderboard } from "./routes/leaderboard.js";
import { handleCompare } from "./routes/compare.js";
import { handleOverview } from "./routes/overview.js";
import { handleBenchmarks } from "./routes/benchmarks.js";
import { handleTagsCloud } from "./routes/tags-cloud.js";
import { handlePsCloud } from "./routes/ps-cloud.js";
import { handleCacheStatus, handleCacheClear } from "./routes/cache.js";
import { handleCompletions } from "./routes/completions.js";
import { handlePassthrough } from "./routes/passthrough.js";

export const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, User-Agent, Accept"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`
  );
  const pathname = parsedUrl.pathname;

  const host =
    (req.headers["x-forwarded-host"] as string) ||
    req.headers.host ||
    `localhost:${PORT}`;
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  if (pathname === "/openapi.json") {
    return sendJson(res, 200, getOpenApiSpecWithHost(baseUrl));
  }

  if (pathname === "/docs" || pathname === "/reference") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(renderDocsHtml());
  }

  if (pathname === "/" || pathname === "/health") {
    return sendJson(res, 200, {
      status: "ok",
      service: "ollama-cloud-api",
      ollama_host: OLLAMA_HOST,
      docs_url: `${baseUrl}/docs`,
      openapi_url: `${baseUrl}/openapi.json`,
      endpoints: [
        "/api/show-cloud",
        "/api/show-cloud/grouped",
        "/api/recommend",
        "/api/chat",
        "/api/generate",
        "/api/leaderboard",
        "/api/compare?models=<m1>,<m2>",
        "/api/overview",
        "/api/benchmarks",
        "/api/benchmarks?model=<name>",
        "/api/tags-cloud",
        "/api/ps-cloud",
        "/api/cache/status",
        "/api/cache/clear",
        "/docs",
        "/openapi.json",
        "/api/tags",
        "/health",
      ],
    });
  }

  if (pathname === "/api/overview" || pathname === "/overview") {
    return handleOverview(req, res);
  }

  if (pathname === "/api/leaderboard" || pathname === "/leaderboard") {
    return handleLeaderboard(req, res, parsedUrl);
  }

  if (pathname === "/api/compare" || pathname === "/compare") {
    return handleCompare(req, res, parsedUrl);
  }

  if (pathname === "/api/recommend" || pathname === "/recommend") {
    return handleRecommend(req, res, parsedUrl);
  }

  if (pathname === "/api/benchmarks" || pathname === "/benchmarks") {
    return handleBenchmarks(req, res, parsedUrl);
  }

  if (pathname === "/api/cache/status") {
    return handleCacheStatus(req, res);
  }

  if (pathname === "/api/cache/clear") {
    return handleCacheClear(req, res);
  }

  if (pathname === "/api/tags-cloud" || pathname === "/tags-cloud") {
    return handleTagsCloud(req, res, parsedUrl);
  }

  if (pathname === "/api/ps-cloud" || pathname === "/ps-cloud") {
    return handlePsCloud(req, res);
  }

  if (
    pathname === "/api/show-cloud/grouped" ||
    pathname === "/show-cloud/grouped"
  ) {
    return handleShowCloudAll(req, res, parsedUrl, true);
  }

  if (pathname === "/api/show-cloud" || pathname === "/show-cloud") {
    const includeBenchmarks = parsedUrl.searchParams.get("benchmarks") === "true";

    if (req.method === "GET") {
      const model = parsedUrl.searchParams.get("model");
      const isGrouped = parsedUrl.searchParams.get("grouped") === "true";
      if (!model) {
        return handleShowCloudAll(req, res, parsedUrl, isGrouped, includeBenchmarks);
      }
      return handleShowCloud(req, res, {
        model,
        verbose: true,
        benchmarks: includeBenchmarks,
      });
    }

    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const payload = JSON.parse(body || "{}");
        return handleShowCloud(req, res, payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return sendError(res, 400, `Invalid JSON: ${message}`);
      }
    }
  }

  if (
    (pathname === "/api/chat" || pathname === "/api/generate") &&
    req.method === "POST"
  ) {
    return handleCompletions(req, res, pathname);
  }

  return handlePassthrough(req, res);
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\nOllama Cloud API running at http://localhost:${PORT}`);
    console.log(`Interactive Docs:  http://localhost:${PORT}/docs`);
    console.log(`OpenAPI Spec:      http://localhost:${PORT}/openapi.json`);
    console.log(`Recommendation:    GET  http://localhost:${PORT}/api/recommend?task=coding&max_usage=2`);
    console.log(`Chat completion:   POST http://localhost:${PORT}/api/chat`);
    console.log(`Generate:          POST http://localhost:${PORT}/api/generate`);
    console.log(`Leaderboard:       GET  http://localhost:${PORT}/api/leaderboard`);
    console.log(`Compare models:    GET  http://localhost:${PORT}/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud`);
    console.log(`Catalog overview:  GET  http://localhost:${PORT}/api/overview`);
    console.log(`Show all cloud:    GET  http://localhost:${PORT}/api/show-cloud`);
    console.log(`Upstream target:   ${OLLAMA_HOST}\n`);
  });
}
