import type http from "http";
import type { URL } from "url";
import { fetchLiveCloudCatalog, fetchModelUsage, fetchModelBenchmarks } from "../services/scraper.js";
import { computeLeaderboard } from "../services/leaderboard.js";
import { sendJson, withError } from "../utils/http.js";

export const handleLeaderboard = withError(async (
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL
) => {
  const liveCatalog = await fetchLiveCloudCatalog();

  const usageMap = new Map<string, number>();
  const benchDataList: Array<{ model: string; data: Parameters<typeof computeLeaderboard>[0][number]["data"] }> = [];

  await Promise.all(
    liveCatalog.map(async (catModel) => {
      const name = catModel.name;
      const u = await fetchModelUsage(name);
      usageMap.set(name, u);

      const b = await fetchModelBenchmarks(name);
      if (b) {
        benchDataList.push({ model: catModel.cloud_tag, data: b });
      }
    })
  );

  const leaderboards = computeLeaderboard(benchDataList, usageMap);
  const requestedCat = parsedUrl.searchParams.get("category");

  if (requestedCat && leaderboards[requestedCat]) {
    sendJson(res, 200, {
      category: requestedCat,
      leaderboard: leaderboards[requestedCat],
    });
    return;
  }

  sendJson(res, 200, {
    categories: Object.keys(leaderboards),
    leaderboards,
  });
});
