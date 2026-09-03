import type http from "http";
import { URL } from "url";
import { getOpenApiSpecWithHost, renderDocsHtml } from "./openapi.js";
import { readBody, sendJson, sendError } from "./utils/http.js";
import { PORT, OLLAMA_HOST } from "./config.js";

import { handleShowCloud, handleShowCloudAll } from "./routes/show-cloud.js";
import { handleRecommend } from "./routes/recommend.js";
import { handleLeaderboard } from "./routes/leaderboard.js";
import { handleCompare } from "./routes/compare.js";
import { handleOverview } from "./routes/overview.js";
import { handleBenchmarks } from "./routes/benchmarks.js";
import { handleCompletions } from "./routes/completions.js";
import { handlePassthrough } from "./routes/passthrough.js";

export function createRouter() {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, User-Agent, Accept"
    );
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

    // Handle OPTIONS requests
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    // Parse URL
    const parsedUrl = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`
    );
    const pathname = parsedUrl.pathname;

    // Extract host and protocol information
    const host =
      (req.headers["x-forwarded-host"] as string) ||
      req.headers.host ||
      `localhost:${PORT}`;
    const proto =
      (req.headers["x-forwarded-proto"] as string) ||
      (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
    const baseUrl = `${proto}://${host}`;

    // Route handling
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
          "/api/recommend",
          "/api/leaderboard",
          "/api/compare?models=<m1>,<m2>",
          "/api/overview",
          "/api/benchmarks",
          "/api/benchmarks?model=<name>",
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

    // Handle show-cloud endpoints (both specific model and listing)
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

    // Handle chat and generate endpoints with special cloud-aware logic
    if ((pathname === "/api/chat" || pathname === "/api/generate") && req.method === "POST") {
      return handleCompletions(req, res, pathname);
    }

    // Default to passthrough for unmatched routes
    return handlePassthrough(req, res);
  };
}
