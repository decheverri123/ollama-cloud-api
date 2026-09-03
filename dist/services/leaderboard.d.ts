import type { ParsedBenchmarkTable } from "../types.js";
export declare function computeLeaderboard(benchmarkEntries: Array<{
    model: string;
    data: ParsedBenchmarkTable;
}>, usageMap: Map<string, number>): Record<string, Array<Record<string, unknown>>>;
