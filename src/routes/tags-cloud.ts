import type http from "http";
import type { URL } from "url";
import { fetchOllamaTags } from "../services/ollama.js";
import { fetchLiveCloudCatalog, fetchModelUsage } from "../services/scraper.js";
import {
  isCloudModel,
  findLocalInstalledModel,
  applyFiltersAndSort,
  groupModelsByTier,
} from "../utils/model.js";
import { sendJson, withError } from "../utils/http.js";

export const handleTagsCloud = withError(async (
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL
) => {
  const [rawLocalModels, liveCatalog] = await Promise.all([
    fetchOllamaTags(),
    fetchLiveCloudCatalog(),
  ]);

  const localCloudModels = rawLocalModels.filter(isCloudModel);

  const enrichedTags = await Promise.all(
    liveCatalog.map(async (catModel) => {
      const name = catModel.name;
      const localMatch = findLocalInstalledModel(name, localCloudModels);
      const usage = await fetchModelUsage(name);

      return {
        name: catModel.cloud_tag,
        model: catModel.name,
        description: catModel.description,
        installed: localMatch !== null,
        installed_tag: localMatch?.name || localMatch?.model || null,
        pull_command: catModel.pull_command,
        usage,
        details: localMatch?.details,
        size: localMatch?.size || 0,
      };
    })
  );

  const filtered = applyFiltersAndSort(enrichedTags, parsedUrl.searchParams);

  if (parsedUrl.searchParams.get("grouped") === "true") {
    sendJson(res, 200, groupModelsByTier(filtered));
    return;
  }

  sendJson(res, 200, { models: filtered });
});