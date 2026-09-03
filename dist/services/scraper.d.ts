import type { LiveCloudModelInfo, ParsedBenchmarkTable, ModelPricing } from "../types.js";
export declare function fetchModelUsageDetails(modelName: string): Promise<{
    usage: number;
    pricing?: ModelPricing;
}>;
export declare function fetchModelUsage(modelName: string): Promise<number>;
export declare function getCloudTagForModel(modelName: string): string | undefined;
export declare function fetchCloudTagForModel(modelName: string): Promise<string | undefined>;
export declare function fetchLiveCloudCatalog(): Promise<LiveCloudModelInfo[]>;
export declare function fetchModelBenchmarks(modelName: string): Promise<ParsedBenchmarkTable | null>;
