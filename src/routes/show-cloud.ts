import type http from "http";
import type { URL } from "url";
import { fetchOllamaTags, getEnrichedModelData } from "../services/ollama.js";
import { fetchLiveCloudCatalog, fetchModelUsage } from "../services/scraper.js";
import {
  isCloudModel,
  findLocalInstalledModel,
  applyFiltersAndSort,
  groupModelsByTier,
} from "../utils/model.js";
import { sendJson, withError } from "../utils/http.js";
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
  sendJson(res, 200, enriched);
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
          description: catModel.description,
          installed_tag: localMatch ? localMatch.name || localMatch.model : null,
          pull_command: catModel.pull_command,
          ...(localMatch || {}),
          ...enriched,
          installed: isInstalled,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          name: catModel.cloud_tag,
          cloud_name: catModel.name,
          description: catModel.description,
          installed: isInstalled,
          installed_tag: localMatch ? localMatch.name || localMatch.model : null,
          pull_command: catModel.pull_command,
          usage: await fetchModelUsage(name),
          error: message,
        };
      }
    })
  );

  const filtered = applyFiltersAndSort(enrichedModels, parsedUrl.searchParams);

  if (grouped) {
    sendJson(res, 200, groupModelsByTier(filtered));
    return;
  }

  sendJson(res, 200, { models: filtered });
});
