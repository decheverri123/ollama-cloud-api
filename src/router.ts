import type http from "http";
import { URL } from "url";
import { getOpenApiSpecWithHost, renderDocsHtml } from "./openapi.js";
import { readBody, sendJson, sendError } from "./utils/http.js";
import { PORT, OLLAMA_HOST, ENABLE_COMPLETIONS } from "./config.js";

import { handleShowCloud, handleShowCloudAll } from "./routes/show-cloud.js";
import { handleRecommend } from "./routes/recommend.js";
import { handleLeaderboard } from "./routes/leaderboard.js";
import { handleCompare } from "./routes/compare.js";
import { handleOverview } from "./routes/overview.js";
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

    if (pathname === "/docs") {
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
          "/docs",
          "/openapi.json",
          "/health",
        ],
      });
    }

    if (pathname === "/api/overview") {
      return handleOverview(req, res);
    }

    if (pathname === "/api/leaderboard") {
      return handleLeaderboard(req, res, parsedUrl);
    }

    if (pathname === "/api/compare") {
      return handleCompare(req, res, parsedUrl);
    }

    if (pathname === "/api/recommend") {
      return handleRecommend(req, res, parsedUrl);
    }

    // Handle show-cloud endpoints (both specific model and listing)
    if (pathname === "/api/show-cloud") {
      const includeBenchmarks =
        parsedUrl.searchParams.get("benchmarks") === "true" ||
        parsedUrl.searchParams.get("has_benchmarks") === "true";

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

    // Protect host credits by disabling all inference endpoints (/api/chat, /api/generate, /api/embed, /api/embeddings) unless explicitly enabled
    if (
      pathname === "/api/chat" ||
      pathname === "/api/generate" ||
      pathname === "/api/embed" ||
      pathname === "/api/embeddings"
    ) {
      if (!ENABLE_COMPLETIONS) {
        return sendJson(res, 403, {
          error: "Inference endpoints are disabled on this instance to protect host credits",
          message:
            "This API server provides cloud model discovery, usage tiers (1-4), recommendations, and benchmarks. Send inference requests directly to your own Ollama instance.",
          hint: "Set ENABLE_COMPLETIONS=true in your environment if you wish to allow callers to run inference on your upstream Ollama host.",
        });
      }
      return handlePassthrough(req, res);
    }

    // Safe, read-only Ollama metadata endpoints (zero token cost)
    if (
      pathname === "/api/tags" ||
      pathname === "/api/show" ||
      pathname === "/api/ps" ||
      pathname === "/api/version"
    ) {
      return handlePassthrough(req, res);
    }

    // Block mutating model management endpoints
    if (
      pathname === "/api/pull" ||
      pathname === "/api/push" ||
      pathname === "/api/create" ||
      pathname === "/api/delete" ||
      pathname === "/api/copy"
    ) {
      return sendJson(res, 403, {
        error: "Model management endpoints are disabled on this proxy",
        message: "This proxy only serves cloud model discovery and read-only metadata.",
      });
    }

    // Return 404 for any other unrecognized routes
    return sendJson(res, 404, {
      error: "Not Found",
      message: `The endpoint '${pathname}' does not exist on this server.`,
    });
  };
}
