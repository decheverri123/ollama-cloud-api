import type http from "http";
import type { URL } from "url";
import { fetchOllamaTags, getEnrichedModelData } from "../services/ollama.js";
import { fetchLiveCloudCatalog, fetchModelUsageDetails } from "../services/scraper.js";
import {
  isCloudModel,
  findLocalInstalledModel,
  applyFiltersAndSort,
  groupModelsByTier,
  getUsageLabel,
  inferModelProvider,
  inferModelProfile,
  getKnownContextLength,
  getKnownParameterSize,
  getOllamaModelUrl,
} from "../utils/model.js";
import { sendJson, withError } from "../utils/http.js";
import { getCatalogOverview } from "./overview.js";
import type { ShowCloudRequest, OllamaModelInfo } from "../types.js";

export const handleShowCloud = withError(async (
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  payload: ShowCloudRequest
) => {
  const modelName = payload.model;
  if (!modelName) {
    sendJson(res, 400, { error: "missing model field" });
    return;
  }

  const enriched = await getEnrichedModelData(
    modelName,
    payload.verbose ?? true,
    payload.benchmarks ?? false
  );
  sendJson(res, 200, { model: modelName, ...enriched });
});

export const handleShowCloudAll = withError(async (
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL,
  grouped: boolean = false,
  includeBenchmarks: boolean = false
) => {
  const [rawLocalModels, liveCatalog] = await Promise.all([
    fetchOllamaTags(),
    fetchLiveCloudCatalog(),
  ]);

  const localCloudModels = rawLocalModels.filter(isCloudModel);

  const enrichedModels = await Promise.all(
    liveCatalog.map(async (catModel) => {
      const name = catModel.name;
      const localMatch: OllamaModelInfo | null = findLocalInstalledModel(name, localCloudModels);
      const isInstalled = localMatch !== null;
      const targetModelName = localMatch?.name || localMatch?.model || catModel.cloud_tag;

      try {
        const enriched = await getEnrichedModelData(
          targetModelName,
          true,
          includeBenchmarks
        );

        return {
          name: catModel.cloud_tag,
          cloud_name: catModel.name,
          ollama_url: getOllamaModelUrl(catModel.name),
          description: catModel.description,
          installed_tag: localMatch?.name || localMatch?.model || null,
          pull_command: catModel.pull_command,
          ...(localMatch ?? {}),
          ...enriched,
          installed: isInstalled,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const { usage, pricing } = await fetchModelUsageDetails(name);
        const { provider, family } = inferModelProvider(name);
        const paramSize = getKnownParameterSize(name);
        return {
          name: catModel.cloud_tag,
          cloud_name: catModel.name,
          ollama_url: getOllamaModelUrl(catModel.name),
          description: catModel.description,
          installed: isInstalled,
          installed_tag: localMatch?.name || localMatch?.model || null,
          pull_command: catModel.pull_command,
          usage,
          usage_label: getUsageLabel(usage),
          pricing,
          provider,
          family,
          profile: inferModelProfile(name),
          context_length: getKnownContextLength(name),
          parameter_size: paramSize,
          details: { parameter_size: paramSize },
          error: message,
        };
      }
    })
  );

  const filtered = applyFiltersAndSort(enrichedModels, parsedUrl.searchParams);

  const summaryParam = parsedUrl.searchParams.get("summary");
  if (summaryParam === "only") {
    const summary = await getCatalogOverview();
    sendJson(res, 200, summary);
    return;
  }

  if (grouped) {
    const groupedData: Record<string, unknown> = groupModelsByTier(filtered);
    if (summaryParam === "true") {
      groupedData.summary = await getCatalogOverview();
    }
    sendJson(res, 200, groupedData);
    return;
  }

  if (summaryParam === "true") {
    sendJson(res, 200, {
      summary: await getCatalogOverview(),
      models_count: filtered.length,
      models: filtered,
    });
    return;
  }

  sendJson(res, 200, { models: filtered });
});