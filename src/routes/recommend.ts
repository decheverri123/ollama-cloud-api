import type http from "http";
import type { URL } from "url";
import { recommendModel } from "../services/recommend.js";
import { parseCapabilities } from "../utils/model.js";
import { readBody, sendJson, withError } from "../utils/http.js";

export const handleRecommend = withError(async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL
) => {
  if (req.method === "POST") {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const result = await recommendModel({
      task: payload.task,
      maxUsage: payload.max_usage,
      capabilities: parseCapabilities(payload.capability),
      minContext: payload.min_context,
      onlyInstalled: payload.installed,
    });
    sendJson(res, 200, result);
    return;
  }

  const maxUsageParam = parsedUrl.searchParams.get("max_usage");
  const maxUsage = maxUsageParam ? parseInt(maxUsageParam, 10) : 4;
  const reqCaps = parseCapabilities(parsedUrl.searchParams.get("capability"));
  const minContextParam = parsedUrl.searchParams.get("min_context");
  const minContext = minContextParam ? parseInt(minContextParam, 10) : 0;

  const result = await recommendModel({
    task: parsedUrl.searchParams.get("task") || "coding",
    maxUsage,
    capabilities: reqCaps,
    minContext,
    onlyInstalled: parsedUrl.searchParams.get("installed") === "true",
  });
  sendJson(res, 200, result);
});
