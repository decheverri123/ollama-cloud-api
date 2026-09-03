import { OLLAMA_HOST } from "../config.js";
import { fetchModelUsageDetails, fetchModelBenchmarks } from "./scraper.js";
import { getUsageLabel, inferModelProvider, inferModelProfile, getKnownContextLength, getKnownParameterSize, getOllamaModelUrl, } from "../utils/model.js";
async function fetchOllamaList(path) {
    try {
        const res = await fetch(`${OLLAMA_HOST}${path}`);
        if (!res.ok)
            return [];
        const data = (await res.json());
        return data.models || [];
    }
    catch {
        // Upstream Ollama unavailable; return empty list
        return [];
    }
}
export function fetchOllamaTags() {
    return fetchOllamaList("/api/tags");
}
export function fetchOllamaPs() {
    return fetchOllamaList("/api/ps");
}
export async function getEnrichedModelData(modelName, verbose = true, includeBenchmarks = false) {
    const ollamaPromise = fetch(`${OLLAMA_HOST}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, verbose }),
    })
        .then(async (r) => (r.ok ? (await r.json()) : null))
        .catch(() => null);
    const usagePromise = fetchModelUsageDetails(modelName);
    const benchmarkPromise = includeBenchmarks
        ? fetchModelBenchmarks(modelName)
        : Promise.resolve(null);
    const [modelDetails, usageData, benchmarks] = (await Promise.all([
        ollamaPromise,
        usagePromise,
        benchmarkPromise,
    ]));
    const usage = usageData?.usage || 1;
    const { provider, family } = inferModelProvider(modelName);
    const profile = inferModelProfile(modelName);
    const detailsObj = modelDetails?.details;
    const modelInfoObj = modelDetails?.model_info;
    const detectedContext = modelInfoObj?.context_length ||
        detailsObj?.context_length ||
        (detailsObj?.family
            ? modelInfoObj?.[`${detailsObj.family}.context_length`]
            : undefined);
    const contextLength = detectedContext || getKnownContextLength(modelName);
    const detectedParamSize = detailsObj?.parameter_size;
    const parameterSize = detectedParamSize || getKnownParameterSize(modelName);
    const result = {
        ...(modelDetails || {}),
        details: {
            ...(detailsObj || {}),
            parameter_size: parameterSize,
        },
        usage,
        usage_label: getUsageLabel(usage),
        pricing: usageData?.pricing,
        provider,
        family: detailsObj?.family ? String(detailsObj.family) : family,
        profile,
        context_length: contextLength,
        parameter_size: parameterSize,
        ollama_url: getOllamaModelUrl(modelName),
        installed: modelDetails !== null,
    };
    if (includeBenchmarks) {
        result.benchmarks = benchmarks ?? undefined;
    }
    return result;
}
