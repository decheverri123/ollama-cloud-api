import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import type http from "node:http";
import { createRouter, createServer } from "../src/index.js";

interface MockResponseContext {
  res: http.ServerResponse;
  getStatusCode: () => number;
  getHeaders: () => Record<string, string>;
  getBody: () => string;
  getJson: () => any;
}

function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
} = {}): http.IncomingMessage {
  const body = options.body || "";
  const req = new Readable({
    read() {
      if (body) this.push(body);
      this.push(null);
    },
  }) as unknown as http.IncomingMessage;

  req.method = options.method || "GET";
  req.url = options.url || "/";
  req.headers = { host: "localhost:11435", ...options.headers };
  return req;
}

function createMockResponse(): MockResponseContext {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = "";

  const res = new Writable({
    write(chunk, _encoding, callback) {
      body += chunk.toString();
      callback();
    },
  }) as unknown as http.ServerResponse;

  res.writeHead = (status: number, h?: any) => {
    statusCode = status;
    if (h) {
      for (const [k, v] of Object.entries(h)) {
        headers[k.toLowerCase()] = String(v);
      }
    }
    return res;
  };

  res.setHeader = (key: string, val: any) => {
    headers[key.toLowerCase()] = String(val);
    return res;
  };

  res.getHeader = (key: string) => headers[key.toLowerCase()];

  return {
    res,
    getStatusCode: () => statusCode,
    getHeaders: () => headers,
    getBody: () => body,
    getJson: () => JSON.parse(body),
  };
}

async function request(
  router: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<unknown> | unknown,
  options: { method?: string; url?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<MockResponseContext> {
  const req = createMockRequest(options);
  const mockRes = createMockResponse();
  await router(req, mockRes.res);
  return mockRes;
}

test("createServer returns an http.Server instance", () => {
  const server = createServer();
  assert.ok(server);
  assert.equal(typeof server.listen, "function");
});

test("CORS headers and OPTIONS preflight request", async () => {
  const router = createRouter();
  const res = await request(router, { method: "OPTIONS", url: "/api/show-cloud" });
  assert.equal(res.getStatusCode(), 204);
  assert.equal(res.getHeaders()["access-control-allow-origin"], "*");
  assert.equal(res.getHeaders()["access-control-allow-methods"], "POST, GET, OPTIONS");
});

test("GET / and /health return service status and discovery endpoints", async () => {
  const router = createRouter();
  const res = await request(router, { method: "GET", url: "/health" });
  assert.equal(res.getStatusCode(), 200);
  const json = res.getJson();
  assert.equal(json.status, "ok");
  assert.equal(json.service, "ollama-cloud-api");
  assert.ok(Array.isArray(json.endpoints));
  assert.ok(json.endpoints.includes("/api/show-cloud"));
});

test("GET /openapi.json returns OpenAPI 3.1.0 spec", async () => {
  const router = createRouter();
  const res = await request(router, {
    method: "GET",
    url: "/openapi.json",
    headers: { host: "api.example.com", "x-forwarded-proto": "https" },
  });
  assert.equal(res.getStatusCode(), 200);
  const spec = res.getJson();
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.info.title, "Ollama Cloud API");
  assert.equal(spec.servers[0].url, "https://api.example.com");
  assert.ok(spec.paths["/api/show-cloud"]);
});

test("GET /docs returns Scalar HTML documentation", async () => {
  const router = createRouter();
  const res = await request(router, { method: "GET", url: "/docs" });
  assert.equal(res.getStatusCode(), 200);
  assert.ok(res.getHeaders()["content-type"].includes("text/html"));
  assert.ok(res.getBody().includes("@scalar/api-reference"));
});

test("GET /api/overview returns catalog statistics and tier breakdown", async () => {
  const router = createRouter();
  const res = await request(router, { method: "GET", url: "/api/overview" });
  assert.equal(res.getStatusCode(), 200);
  const json = res.getJson();
  assert.ok(typeof json.live_cloud_catalog_count === "number");
  assert.ok(json.usage_tier_distribution);
  assert.ok(json.usage_tier_distribution["1_low"] !== undefined);
  assert.ok(json.usage_tier_distribution["2_medium"] !== undefined);
});

test("GET /api/leaderboard returns ranked model leaderboard", async () => {
  const router = createRouter();
  const res = await request(router, { method: "GET", url: "/api/leaderboard?category=Coding" });
  assert.equal(res.getStatusCode(), 200);
  const json = res.getJson();
  assert.equal(json.category.toLowerCase(), "coding");
  assert.ok(Array.isArray(json.leaderboard));
  assert.ok(json.leaderboard.length > 0);
});

test("GET /api/compare compares multiple cloud models side-by-side", async () => {
  const router = createRouter();
  const res = await request(router, {
    method: "GET",
    url: "/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud",
  });
  assert.equal(res.getStatusCode(), 200);
  const json = res.getJson();
  assert.ok(Array.isArray(json.compared_models));
  const flash = json.compared_models.find((m: any) => m.name === "glm-5.3-flash:cloud");
  assert.ok(flash);
  assert.equal(flash.usage, 2);
  assert.equal(flash.provider, "Zhipu AI");
  assert.ok(Array.isArray(json.benchmark_comparison));
});

test("GET /api/recommend recommends a model within usage limits", async () => {
  const router = createRouter();
  const res = await request(router, {
    method: "GET",
    url: "/api/recommend?task=coding&max_usage=2",
  });
  assert.equal(res.getStatusCode(), 200);
  const json = res.getJson();
  assert.equal(json.task, "coding");
  assert.ok(json.recommendation);
  assert.ok(json.score > 0);
  assert.ok(json.reason);
});

test("GET /api/show-cloud?model=... returns single model metadata", async () => {
  const router = createRouter();
  const res = await request(router, {
    method: "GET",
    url: "/api/show-cloud?model=glm-5.3-flash:cloud",
  });
  assert.equal(res.getStatusCode(), 200);
  const json = res.getJson();
  assert.equal(json.model, "glm-5.3-flash:cloud");
  assert.equal(json.usage, 2);
  assert.equal(json.usage_label, "Medium");
  assert.equal(json.provider, "Zhipu AI");
  assert.equal(json.profile, "fast");
  assert.ok(json.pricing);
  assert.equal(json.pricing.input, 0.15);
  assert.equal(json.pricing.output, 0.5);
  assert.equal(json.ollama_url, "https://ollama.com/library/glm-5.3-flash");
});

test("Inference endpoints return 403 Forbidden to protect host credits", async () => {
  const router = createRouter();
  const res = await request(router, { method: "POST", url: "/api/chat" });
  assert.equal(res.getStatusCode(), 403);
  const json = res.getJson();
  assert.ok(json.error.includes("Inference endpoints are disabled"));
  assert.ok(json.hint.includes("ENABLE_COMPLETIONS=true"));
});

test("Mutating endpoints return 403 Forbidden", async () => {
  const router = createRouter();
  const res = await request(router, { method: "POST", url: "/api/pull" });
  assert.equal(res.getStatusCode(), 403);
  const json = res.getJson();
  assert.ok(json.error.includes("Model management endpoints are disabled"));
});

test("Unknown endpoints return 404 Not Found", async () => {
  const router = createRouter();
  const res = await request(router, { method: "GET", url: "/nonexistent-route" });
  assert.equal(res.getStatusCode(), 404);
  const json = res.getJson();
  assert.equal(json.error, "Not Found");
});
