import type { OllamaModelInfo, EnrichedModelData } from "../types.js";
export declare function fetchOllamaTags(): Promise<OllamaModelInfo[]>;
export declare function fetchOllamaPs(): Promise<OllamaModelInfo[]>;
export declare function getEnrichedModelData(modelName: string, verbose?: boolean, includeBenchmarks?: boolean): Promise<EnrichedModelData>;
