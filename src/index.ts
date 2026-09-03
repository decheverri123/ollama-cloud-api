#!/usr/bin/env node
import http from "http";
import fs from "fs";
import { fileURLToPath } from "url";
import { PORT, OLLAMA_HOST } from "./config.js";
import { createRouter } from "./router.js";

export { createRouter } from "./router.js";

export function createServer(options?: { router?: http.RequestListener }): http.Server {
  const handler = options?.router ?? createRouter();
  return http.createServer(handler);
}

export const server = createServer();

export function startServer(port: number = PORT, host: string = "0.0.0.0"): http.Server {
  return server.listen(port, host, () => {
    console.log(`\nOllama Cloud API running at http://localhost:${port}`);
    console.log(`Interactive Docs:  http://localhost:${port}/docs`);
    console.log(`OpenAPI Spec:      http://localhost:${port}/openapi.json`);
    console.log(`Recommendation:    GET  http://localhost:${port}/api/recommend?task=coding&max_usage=2`);
    console.log(`Leaderboard:       GET  http://localhost:${port}/api/leaderboard`);
    console.log(`Compare models:    GET  http://localhost:${port}/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud`);
    console.log(`Catalog overview:  GET  http://localhost:${port}/api/overview`);
    console.log(`Show all cloud:    GET  http://localhost:${port}/api/show-cloud`);
    console.log(`Upstream target:   ${OLLAMA_HOST}\n`);
  });
}

function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  try {
    const currentPath = fileURLToPath(import.meta.url);
    const scriptPath = fs.realpathSync(process.argv[1]);
    return currentPath === scriptPath;
  } catch {
    return (
      process.argv[1].endsWith("index.js") ||
      process.argv[1].endsWith("index.ts") ||
      process.argv[1].endsWith("ollama-cloud-api") ||
      process.argv[1].endsWith("ollama-proxy")
    );
  }
}

if (isDirectRun() && process.env.NODE_ENV !== "test") {
  startServer();
}