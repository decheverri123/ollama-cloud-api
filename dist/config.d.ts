import type { ModelPricing, UsageCacheEntry, BenchmarkCacheEntry, LiveCloudModelInfo } from "./types.js";
export declare const OLLAMA_HOST: string;
export declare const PORT: number;
export declare const CACHE_TTL_MS: number;
export declare const ENABLE_COMPLETIONS: boolean;
export declare const KNOWN_MODEL_TIERS: Record<string, {
    usage: number;
    pricing: ModelPricing;
}>;
export declare const usageCache: Map<string, UsageCacheEntry>;
export declare const benchmarkCache: Map<string, BenchmarkCacheEntry>;
export declare let liveCatalogCache: {
    models: LiveCloudModelInfo[];
    timestamp: number;
} | null;
export declare function setLiveCatalogCache(cache: {
    models: LiveCloudModelInfo[];
    timestamp: number;
} | null): void;
export declare function seedCaches(): void;
export declare function resetCaches(): number;
