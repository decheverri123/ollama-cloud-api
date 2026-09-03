#!/usr/bin/env node
import http from "http";
import { PORT, OLLAMA_HOST } from "./config.js";
import { createRouter } from "./router.js";
export const server = http.createServer(createRouter());
if (process.env.NODE_ENV !== "test") {
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`\nOllama Cloud API running at http://localhost:${PORT}`);
        console.log(`Interactive Docs:  http://localhost:${PORT}/docs`);
        console.log(`OpenAPI Spec:      http://localhost:${PORT}/openapi.json`);
        console.log(`Recommendation:    GET  http://localhost:${PORT}/api/recommend?task=coding&max_usage=2`);
        console.log(`Leaderboard:       GET  http://localhost:${PORT}/api/leaderboard`);
        console.log(`Compare models:    GET  http://localhost:${PORT}/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud`);
        console.log(`Catalog overview:  GET  http://localhost:${PORT}/api/overview`);
        console.log(`Show all cloud:    GET  http://localhost:${PORT}/api/show-cloud`);
        console.log(`Upstream target:   ${OLLAMA_HOST}\n`);
    });
}
