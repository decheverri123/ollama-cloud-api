import type http from "http";
import type { URL } from "url";
import { fetchModelBenchmarks, fetchLiveCloudCatalog } from "../services/scraper.js";
import { sendJson, withError } from "../utils/http.js";

export const handleBenchmarks = withError(async (
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL
) => {
  const model = parsedUrl.searchParams.get("model");
  if (model) {
    const benchmarks = await fetchModelBenchmarks(model);
    if (!benchmarks) {
      sendJson(res, 200, {
        model,
        has_benchmarks: false,
        message: "No benchmark data found on Ollama library page for this model.",
      });
      return;
    }
    sendJson(res, 200, {
      model,
      has_benchmarks: true,
      ...benchmarks,
    });
    return;
  }

  const liveCatalog = await fetchLiveCloudCatalog();

  const benchmarkResults = await Promise.all(
    liveCatalog.map(async (catModel) => {
      const name = catModel.name;
      const data = await fetchModelBenchmarks(name);
      if (!data) return null;
      return {
        model: catModel.cloud_tag,
        ...data,
      };
    })
  );

  const available = benchmarkResults.filter(Boolean);

  sendJson(res, 200, {
    models_with_benchmarks_count: available.length,
    models: available,
  });
});
