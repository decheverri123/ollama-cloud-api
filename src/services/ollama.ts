import { OLLAMA_HOST } from "../config.js";
import { fetchModelUsage, fetchModelBenchmarks } from "./scraper.js";
import type { OllamaModelInfo, ParsedBenchmarkTable, EnrichedModelData } from "../types.js";

async function fetchOllamaList(path: string): Promise<OllamaModelInfo[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}${path}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: OllamaModelInfo[] };
    return data.models || [];
  } catch {
    return [];
  }
}

export function fetchOllamaTags(): Promise<OllamaModelInfo[]> {
  return fetchOllamaList("/api/tags");
}

export function fetchOllamaPs(): Promise<OllamaModelInfo[]> {
  return fetchOllamaList("/api/ps");
}

export async function getEnrichedModelData(
  modelName: string,
  verbose = true,
  includeBenchmarks = false
): Promise<EnrichedModelData> {
  const ollamaPromise = fetch(`${OLLAMA_HOST}/api/show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName, verbose }),
  })
    .then(async (r) => (r.ok ? ((await r.json()) as Record<string, unknown>) : null))
    .catch(() => null);

  const usagePromise = fetchModelUsage(modelName);
  const benchmarkPromise = includeBenchmarks
    ? fetchModelBenchmarks(modelName)
    : Promise.resolve(null);

  const [modelDetails, usage, benchmarks] = (await Promise.all([
    ollamaPromise,
    usagePromise,
    benchmarkPromise,
  ])) as [Record<string, unknown> | null, number, ParsedBenchmarkTable | null];

  const result: EnrichedModelData = {
    ...(modelDetails || {}),
    usage: usage || 1,
    installed: modelDetails !== null,
  };

  if (includeBenchmarks) {
    result.benchmarks = benchmarks ?? undefined;
  }

  return result;
}
