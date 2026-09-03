import type http from "http";
import type { URL } from "url";
import { getEnrichedModelData } from "../services/ollama.js";
import { extractModelScore } from "../utils/model.js";
import { sendJson, withError } from "../utils/http.js";

export const handleCompare = withError(async (
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL
) => {
  const modelsParam = parsedUrl.searchParams.get("models");
  if (!modelsParam) {
    sendJson(res, 400, {
      error: "Missing ?models= query parameter (e.g. ?models=glm-5.3-flash:cloud,glm-5.3:cloud)",
    });
    return;
  }

  const modelNames = modelsParam.split(",").map((m) => m.trim());
  const comparedModels = await Promise.all(
    modelNames.map(async (name) => {
      const enriched = await getEnrichedModelData(name, true, true);
      return {
        name,
        installed: enriched.installed,
        ollama_url: enriched.ollama_url,
        usage: enriched.usage,
        usage_label: enriched.usage_label,
        pricing: enriched.pricing,
        provider: enriched.provider,
        family: enriched.family,
        profile: enriched.profile,
        context_length: enriched.context_length,
        details: enriched.details,
        capabilities: enriched.capabilities || [],
        model_info: enriched.model_info || {},
        benchmarks: enriched.benchmarks,
      };
    })
  );

  const allBenchmarkNames = new Set<string>();
  for (const model of comparedModels) {
    if (model.benchmarks?.rows) {
      for (const row of model.benchmarks.rows) {
        allBenchmarkNames.add(row.benchmark);
      }
    }
  }

  const benchmarkComparison: Array<{
    benchmark: string;
    scores: Record<string, number | string | null>;
  }> = [];

  for (const bName of allBenchmarkNames) {
    const scores: Record<string, number | string | null> = {};
    for (const model of comparedModels) {
      let score: number | string | null = null;
      if (model.benchmarks?.rows) {
        const foundRow = model.benchmarks.rows.find((r) => r.benchmark === bName);
        if (foundRow) {
          score = extractModelScore(foundRow.scores || {}, model.name);
        }
      }
      if (score === null) {
        for (const other of comparedModels) {
          if (other.name !== model.name && other.benchmarks?.rows) {
            const foundRow = other.benchmarks.rows.find(
              (r) => r.benchmark === bName
            );
            if (foundRow) {
              const crossScore = extractModelScore(foundRow.scores || {}, model.name);
              if (crossScore !== null) {
                score = crossScore;
                break;
              }
            }
          }
        }
      }
      scores[model.name] = score;
    }
    benchmarkComparison.push({ benchmark: bName, scores });
  }

  sendJson(res, 200, {
    compared_models: comparedModels.map((model) => ({
      name: model.name,
      ollama_url: model.ollama_url,
      provider: model.provider,
      family: model.family,
      profile: model.profile,
      installed: model.installed,
      usage: model.usage,
      usage_label: model.usage_label,
      pricing: model.pricing,
      parameter_size: model.details?.parameter_size,
      quantization_level: model.details?.quantization_level,
      capabilities: model.capabilities,
      context_length: model.context_length,
    })),
    benchmark_comparison: benchmarkComparison,
  });
});
