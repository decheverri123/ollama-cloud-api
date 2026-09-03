import { URL } from "url";
import { getOpenApiSpecWithHost, renderDocsHtml } from "./openapi.js";
import { readBody, sendJson, sendError } from "./utils/http.js";
import { PORT, OLLAMA_HOST } from "./config.js";
import { handleShowCloud, handleShowCloudAll } from "./routes/show-cloud.js";
import { handleRecommend } from "./routes/recommend.js";
import { handleLeaderboard } from "./routes/leaderboard.js";
import { handleCompare } from "./routes/compare.js";
import { handleOverview } from "./routes/overview.js";
import { handlePassthrough } from "./routes/passthrough.js";
export function createRouter() {
    return async (req, res) => {
        // Set CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent, Accept");
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        // Handle OPTIONS requests
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            return res.end();
        }
        // Parse URL
        const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        const pathname = parsedUrl.pathname;
        // Extract host and protocol information
        const host = req.headers["x-forwarded-host"] ||
            req.headers.host ||
            `localhost:${PORT}`;
        const proto = req.headers["x-forwarded-proto"] ||
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
            const includeBenchmarks = parsedUrl.searchParams.get("benchmarks") === "true" ||
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
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    return sendError(res, 400, `Invalid JSON: ${message}`);
                }
            }
        }
        // Default to passthrough for unmatched routes (standard Ollama endpoints like /api/chat, /api/generate, /api/tags, etc.)
        return handlePassthrough(req, res);
    };
}
