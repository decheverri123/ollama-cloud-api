import { URL } from "url";
import { getOpenApiSpecWithHost, renderDocsHtml } from "./openapi.js";
import { sendJson } from "./utils/http.js";
import { PORT, OLLAMA_HOST } from "./config.js";
import { handleCloudModels } from "./services/cloud-models.js";
import { handleRecommend } from "./routes/recommend.js";
import { handleLeaderboard } from "./routes/leaderboard.js";
import { handleCompare } from "./routes/compare.js";
import { handleOverview } from "./routes/overview.js";
import { handleBenchmarks } from "./routes/benchmarks.js";
import { handlePsCloud } from "./routes/ps-cloud.js";
import { handleCacheStatus, handleCacheClear } from "./routes/cache.js";
import { handleCompletions } from "./routes/completions.js";
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
        // Consolidated handler for both show-cloud and tags-cloud (including subpaths)
        if (pathname.startsWith("/api/show-cloud") ||
            pathname.startsWith("/show-cloud") ||
            pathname.startsWith("/api/tags-cloud") ||
            pathname.startsWith("/tags-cloud")) {
            return handleCloudModels(req, res, parsedUrl);
        }
        if (pathname === "/api/ps-cloud" || pathname === "/ps-cloud") {
            return handlePsCloud(req, res);
        }
        // Handle chat and generate endpoints with special cloud-aware logic
        if ((pathname === "/api/chat" || pathname === "/api/generate") && req.method === "POST") {
            return handleCompletions(req, res, pathname);
        }
        // Default to passthrough for unmatched routes
        return handlePassthrough(req, res);
    };
}
