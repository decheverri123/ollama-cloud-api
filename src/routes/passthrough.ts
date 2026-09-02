import type http from "http";
import { OLLAMA_HOST } from "../config.js";
import { readBody, withError } from "../utils/http.js";

export const handlePassthrough = withError(async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const targetUrl = `${OLLAMA_HOST}${req.url}`;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v && k.toLowerCase() !== "host") {
      headers[k] = Array.isArray(v) ? v.join(", ") : v;
    }
  }

  const requestBody =
    req.method !== "GET" && req.method !== "HEAD" ? await readBody(req) : undefined;

  const proxyRes = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: requestBody,
  });

  res.writeHead(proxyRes.status, {
    "Content-Type": proxyRes.headers.get("Content-Type") || "application/json",
  });
  const proxyData = await proxyRes.text();
  res.end(proxyData);
});
