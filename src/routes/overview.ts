import type http from "http";
import { fetchOllamaTags } from "../services/ollama.js";
import { fetchLiveCloudCatalog, fetchModelUsage, fetchModelBenchmarks } from "../services/scraper.js";
import { isCloudModel, findLocalInstalledModel } from "../utils/model.js";
import { usageCache, benchmarkCache, liveCatalogCache } from "../config.js";
import { sendJson, withError } from "../utils/http.js";

export const handleOverview = withError(async (
  _req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const [rawLocalModels, liveCatalog] = await Promise.all([
    fetchOllamaTags(),
    fetchLiveCloudCatalog(),
  ]);

  const localCloudModels = rawLocalModels.filter(isCloudModel);

  const usageDist: Record<string, number> = {
    "1_low": 0,
    "2_medium": 0,
    "3_high": 0,
    "4_extra_high": 0,
  };

  const capabilitiesCount: Record<string, number> = {};
  let longContextCount = 0;
  const modelsWithBenchmarks: string[] = [];
  const uninstalledModels: string[] = [];

  await Promise.all(
    liveCatalog.map(async (catModel) => {
      const name = catModel.name;
      const usage = await fetchModelUsage(name);
      const key =
        usage === 1 ? "1_low" : usage === 2 ? "2_medium" : usage === 3 ? "3_high" : "4_extra_high";
      usageDist[key] = (usageDist[key] || 0) + 1;

      const localMatch = findLocalInstalledModel(name, localCloudModels);
      if (!localMatch) {
        uninstalledModels.push(catModel.cloud_tag);
      } else {
        if (Array.isArray(localMatch.capabilities)) {
          for (const cap of localMatch.capabilities) {
            capabilitiesCount[cap] = (capabilitiesCount[cap] || 0) + 1;
          }
        }

        const ctx =
          (localMatch.model_info?.context_length as number | undefined) ||
          (localMatch.details?.context_length as number | undefined) ||
          (localMatch.model_info?.[`${localMatch.details?.family}.context_length`] as number | undefined);
        if (ctx && ctx >= 1000000) {
          longContextCount += 1;
        }
      }

      const bench = await fetchModelBenchmarks(name);
      if (bench) {
        modelsWithBenchmarks.push(catModel.cloud_tag);
      }
    })
  );

  sendJson(res, 200, {
    live_cloud_catalog_count: liveCatalog.length,
    installed_cloud_models_count: liveCatalog.length - uninstalledModels.length,
    uninstalled_cloud_models_count: uninstalledModels.length,
    uninstalled_models: uninstalledModels,
    total_local_installed_models: rawLocalModels.length,
    usage_tier_distribution: usageDist,
    capabilities_breakdown: capabilitiesCount,
    models_with_1m_context_count: longContextCount,
    models_with_benchmarks_count: modelsWithBenchmarks.length,
    models_with_benchmarks: modelsWithBenchmarks,
    cache: {
      cached_usage_entries: usageCache.size,
      cached_benchmarks_entries: benchmarkCache.size,
      live_catalog_cached: liveCatalogCache !== null,
    },
  });
});
