import type http from "http";
import type { URL } from "url";
import { fetchOllamaTags } from "./ollama.js";
import { fetchLiveCloudCatalog, fetchModelUsage } from "./scraper.js";
import { getEnrichedModelData } from "./ollama.js";
import {
  isCloudModel,
  findLocalInstalledModel,
  applyFiltersAndSort,
  groupModelsByTier,
} from "../utils/model.js";
import type { ShowCloudRequest, EnrichedModelData, LiveCloudModelInfo, OllamaModelInfo } from "../types.js";
import { sendJson, withError } from "../utils/http.js";

/**
 * Fetches and enriches cloud models with local Ollama data
 * @param includeBenchmarks Whether to include benchmark data (more expensive)
 * @returns Array of enriched cloud models
 */
export async function fetchAndEnrichCloudModels(
  includeBenchmarks = false
): Promise<Array<EnrichedModelData & LiveCloudModelInfo & { installed: boolean }>> {
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
          true, // verbose
          includeBenchmarks
        );

        return {
          name: catModel.cloud_tag, // Use cloud_tag as the name field for LiveCloudModelInfo
          cloud_tag: catModel.cloud_tag,
          cloud_name: catModel.name,
          description: catModel.description,
          installed_tag: localMatch?.name || localMatch?.model || null,
          pull_command: catModel.pull_command,
          ...(localMatch ?? {}),
          ...enriched,
          installed: isInstalled,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          name: catModel.cloud_tag, // LiveCloudModelInfo.name
          cloud_tag: catModel.cloud_tag, // LiveCloudModelInfo.cloud_tag
          cloud_name: catModel.name,
          description: catModel.description,
          installed_tag: localMatch?.name || localMatch?.model || null,
          pull_command: catModel.pull_command,
          usage: await fetchModelUsage(name),
          installed: false,
          error: message,
        };
      }
    })
  );

  return enrichedModels;
}

/**
 * Handler for both show-cloud and tags-cloud endpoints
 * @param req HTTP request
 * @param res HTTP response
 * @param parsedUrl Parsed URL
 * @param payload For POST requests (show-cloud only)
 */
export async function handleCloudModels(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL,
  payload?: ShowCloudRequest
): Promise<void> {
  // Handle POST requests (only for show-cloud with specific model)
  if (req.method === "POST" && payload?.model) {
    // This is the original show-cloud POST behavior
    await handleShowCloudPost(req, res, payload);
    return;
  }

  // GET requests for listing models
  const grouped = parsedUrl.searchParams.get("grouped") === "true";
  const includeBenchmarks = parsedUrl.searchParams.get("benchmarks") === "true";
  
  try {
    const models = await fetchAndEnrichCloudModels(includeBenchmarks);
    const filtered = applyFiltersAndSort(models, parsedUrl.searchParams);
    
    if (grouped) {
      sendJson(res, 200, groupModelsByTier(filtered));
      return;
    }

    // Determine response format based on endpoint
    const pathname = parsedUrl.pathname;
    const isTagsEndpoint = pathname === "/api/tags-cloud" || pathname === "/tags-cloud";
    
    if (isTagsEndpoint) {
      // Return lighter tags format
      const tagsFormat = filtered.map((model) => ({
        name: model.name,
        model: model.cloud_name,
        description: model.description,
        installed: model.installed,
        installed_tag: model.installed_tag || null,
        pull_command: model.pull_command,
        usage: model.usage,
        details: model.details,
        size: model.size || 0,
        // Include error if present (from failed enrichment)
        ...(model.error ? { error: model.error } : {})
      }));
      
      sendJson(res, 200, { models: tagsFormat });
      return;
    }
    
    // Return full show-cloud format
    sendJson(res, 200, { models: filtered });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: `Failed to fetch cloud models: ${message}` });
  }
}

// Handle POST requests for show-cloud (specific model lookup)
async function handleShowCloudPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  payload: ShowCloudRequest
): Promise<void> {
  const modelName = payload.model;
  if (!modelName) {
    sendJson(res, 400, { error: "missing model field" });
    return;
  }

  try {
    const enriched = await getEnrichedModelData(
      modelName,
      payload.verbose ?? true,
      payload.benchmarks ?? false
    );
    sendJson(res, 200, enriched);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 400, { error: `Failed to fetch model data: ${message}` });
  }
}
