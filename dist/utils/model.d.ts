import type { ModelPricing, OllamaModelInfo, FilterableModel } from "../types.js";
export declare function calculateTierFromPricing(inputCost: number, outputCost: number): number;
export declare function getUsageLabel(usage: number): string;
export declare function inferModelProvider(modelName: string): {
    provider: string;
    family: string;
};
export declare function inferModelProfile(modelName: string): "fast" | "thinking" | "pro" | "general";
export declare function getKnownContextLength(modelName: string): number | undefined;
export declare function getKnownParameterSize(modelName: string): string | undefined;
export declare function getOllamaModelUrl(modelName: string): string;
export declare function isCloudModel(model: OllamaModelInfo): boolean;
export declare function getKnownModelTier(modelName: string): {
    usage: number;
    pricing: ModelPricing;
} | null;
export declare function findLocalInstalledModel(cloudSlug: string, localModels: OllamaModelInfo[]): OllamaModelInfo | null;
export declare function normalizeTokens(str: string): string[];
export declare function extractModelScore(scores: Record<string, number | string | null>, modelName: string): number | string | null;
export declare function parseCapabilities(value: unknown): string[];
export declare function applyFiltersAndSort(models: FilterableModel[], searchParams: URLSearchParams): FilterableModel[];
export declare function groupModelsByTier(models: FilterableModel[]): Record<string, FilterableModel[]>;
