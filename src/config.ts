import { KNOWN_MODEL_BENCHMARKS } from "./benchmarks-data.js";
import type {
  ModelPricing,
  UsageCacheEntry,
  BenchmarkCacheEntry,
  LiveCloudModelInfo,
} from "./types.js";

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
export const PORT = parseInt(process.env.PORT || "11435", 10);
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const ENABLE_COMPLETIONS = process.env.ENABLE_COMPLETIONS === "true";

export const KNOWN_MODEL_TIERS: Record<
  string,
  { usage: number; pricing: ModelPricing }
> = {
  "nemotron-3-nano": { usage: 1, pricing: { input: 0.06, output: 0.24, cached: 0.06 } },
  "nemotron-3-nano:30b": { usage: 1, pricing: { input: 0.06, output: 0.24, cached: 0.06 } },
  "gpt-oss": { usage: 1, pricing: { input: 0.07, output: 0.30, cached: 0.035 } },
  "gpt-oss:20b": { usage: 1, pricing: { input: 0.07, output: 0.30, cached: 0.035 } },
  "gpt-oss:120b": { usage: 2, pricing: { input: 0.07, output: 0.30, cached: 0.035 } },
  "gemma4": { usage: 1, pricing: { input: 0.14, output: 0.40, cached: 0.05 } },
  "gemma4:31b": { usage: 1, pricing: { input: 0.14, output: 0.40, cached: 0.05 } },
  "glm-5.3-flash": { usage: 2, pricing: { input: 0.15, output: 0.50, cached: 0.03 } },
  "minimax-m2.7": { usage: 2, pricing: { input: 0.30, output: 1.20, cached: 0.06 } },
  "deepseek-v4-flash": { usage: 2, pricing: { input: 0.44, output: 1.32, cached: 0.014 } },
  "mistral-large-3": { usage: 2, pricing: { input: 0.50, output: 1.50, cached: 0.50 } },
  "mistral-large-3:675b": { usage: 2, pricing: { input: 0.50, output: 1.50, cached: 0.50 } },
  "nemotron-3-super": { usage: 2, pricing: { input: 0.10, output: 0.60, cached: 0.015 } },
  "qwen3.5": { usage: 2, pricing: { input: 0.35, output: 1.50, cached: 0.07 } },
  "glm-5.1": { usage: 3, pricing: { input: 1.00, output: 3.20, cached: 0.20 } },
  "glm-5.2": { usage: 3, pricing: { input: 1.40, output: 4.40, cached: 0.26 } },
  "glm-5.3": { usage: 3, pricing: { input: 1.40, output: 4.40, cached: 0.26 } },
  "kimi-k2.7-code": { usage: 3, pricing: { input: 0.95, output: 4.00, cached: 0.19 } },
  "kimi-k2.6": { usage: 3, pricing: { input: 0.95, output: 4.00, cached: 0.16 } },
  "minimax-m3": { usage: 3, pricing: { input: 0.60, output: 2.40, cached: 0.12 } },
  "nemotron-3-ultra": { usage: 3, pricing: { input: 0.10, output: 3.00, cached: 0.10 } },
  "deepseek-v4-pro": { usage: 4, pricing: { input: 1.32, output: 3.96, cached: 0.044 } },
  "kimi-k3": { usage: 4, pricing: { input: 3.00, output: 15.00, cached: 0.30 } },
};

export const usageCache = new Map<string, UsageCacheEntry>();
export const benchmarkCache = new Map<string, BenchmarkCacheEntry>();

export let liveCatalogCache: { models: LiveCloudModelInfo[]; timestamp: number } | null = null;

export function setLiveCatalogCache(
  cache: { models: LiveCloudModelInfo[]; timestamp: number } | null
): void {
  liveCatalogCache = cache;
}

export function seedCaches(): void {
  for (const [key, val] of Object.entries(KNOWN_MODEL_TIERS)) {
    usageCache.set(key, {
      usage: val.usage,
      pricing: val.pricing,
      timestamp: Date.now(),
    });
  }

  for (const [model, data] of Object.entries(KNOWN_MODEL_BENCHMARKS)) {
    benchmarkCache.set(model, { data, timestamp: Date.now() });
    benchmarkCache.set(`${model}:cloud`, { data, timestamp: Date.now() });
  }
}

export function resetCaches(): number {
  const count = usageCache.size + benchmarkCache.size;
  usageCache.clear();
  benchmarkCache.clear();
  liveCatalogCache = null;
  seedCaches();
  return count;
}

seedCaches();
