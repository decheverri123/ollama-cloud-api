import type { ModelPricing, ParsedBenchmarkTable } from "../types.js";
export declare function decodeHtmlEntities(str: string): string;
export declare function parsePricingFromHtml(html: string): ModelPricing | null;
export declare function parseUsageLevel(usageText: string | null): number;
export declare function parseMarkdownTable(tableText: string): ParsedBenchmarkTable | null;
export declare function parseAllHtmlTables(displayHtml: string): ParsedBenchmarkTable | null;
