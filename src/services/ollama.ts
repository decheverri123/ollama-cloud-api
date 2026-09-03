import { OLLAMA_HOST } from "../config.js";
import { fetchModelUsageDetails, fetchModelBenchmarks } from "./scraper.js";
import {
  getUsageLabel,
  inferModelProvider,
  inferModelProfile,
  getKnownContextLength,
  getOllamaModelUrl,
} from "../utils/model.js";
import type { OllamaModelInfo, ParsedBenchmarkTable, EnrichedModelData, ModelPricing } from "../types.js";

async function fetchOllamaList(path: string): Promise<OllamaModelInfo[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}${path}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: OllamaModelInfo[] };
    return data.models || [];
  } catch {
    // Upstream Ollama unavailable; return empty list
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

  const usagePromise = fetchModelUsageDetails(modelName);
  const benchmarkPromise = includeBenchmarks
    ? fetchModelBenchmarks(modelName)
    : Promise.resolve(null);

  const [modelDetails, usageData, benchmarks] = (await Promise.all([
    ollamaPromise,
    usagePromise,
    benchmarkPromise,
  ])) as [
    Record<string, unknown> | null,
    { usage: number; pricing?: ModelPricing },
    ParsedBenchmarkTable | null,
  ];

  const usage = usageData?.usage || 1;
  const { provider, family } = inferModelProvider(modelName);
  const profile = inferModelProfile(modelName);
  const detailsObj = modelDetails?.details as Record<string, unknown> | undefined;
  const modelInfoObj = modelDetails?.model_info as Record<string, unknown> | undefined;

  const detectedContext =
    (modelInfoObj?.context_length as number | undefined) ||
    (detailsObj?.context_length as number | undefined) ||
    (detailsObj?.family
      ? (modelInfoObj?.[`${detailsObj.family}.context_length`] as number | undefined)
      : undefined);

  const contextLength = detectedContext || getKnownContextLength(modelName);

  const result: EnrichedModelData = {
    ...(modelDetails || {}),
    usage,
    usage_label: getUsageLabel(usage),
    pricing: usageData?.pricing,
    provider,
    family: detailsObj?.family ? String(detailsObj.family) : family,
    profile,
    context_length: contextLength,
    ollama_url: getOllamaModelUrl(modelName),
    installed: modelDetails !== null,
  };

  if (includeBenchmarks) {
    result.benchmarks = benchmarks ?? undefined;
  }

  return result;
}
