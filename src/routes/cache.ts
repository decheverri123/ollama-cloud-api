import type http from "http";
import { CACHE_TTL_MS, usageCache, benchmarkCache, liveCatalogCache, resetCaches } from "../config.js";
import { sendJson } from "../utils/http.js";

export function handleCacheStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const now = Date.now();
  const usageEntries = Array.from(usageCache.entries()).map(([model, entry]) => ({
    model,
    usage: entry.usage,
    age_seconds: Math.round((now - entry.timestamp) / 1000),
    expires_in_seconds: Math.max(
      0,
      Math.round((CACHE_TTL_MS - (now - entry.timestamp)) / 1000)
    ),
  }));

  const benchmarkEntries = Array.from(benchmarkCache.entries()).map(
    ([model, entry]) => ({
      model,
      has_data: entry.data !== null,
      age_seconds: Math.round((now - entry.timestamp) / 1000),
      expires_in_seconds: Math.max(
        0,
        Math.round((CACHE_TTL_MS - (now - entry.timestamp)) / 1000)
      ),
    })
  );

  sendJson(res, 200, {
    cached_usage_count: usageCache.size,
    cached_benchmarks_count: benchmarkCache.size,
    live_catalog_cached: liveCatalogCache !== null,
    ttl_seconds: CACHE_TTL_MS / 1000,
    usage_entries: usageEntries,
    benchmark_entries: benchmarkEntries,
  });
}

export function handleCacheClear(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const count = resetCaches();
  sendJson(res, 200, {
    status: "ok",
    message: `Usage, benchmark, and catalog caches cleared successfully (${count} entries removed)`,
  });
}
