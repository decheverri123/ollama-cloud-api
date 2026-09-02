import type http from "http";
import { OLLAMA_HOST } from "../config.js";
import { fetchOllamaPs } from "../services/ollama.js";
import { fetchModelUsage } from "../services/scraper.js";
import { isCloudModel } from "../utils/model.js";
import { sendJson, withError } from "../utils/http.js";

export const handlePsCloud = withError(async (
  _req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const rawRunning = await fetchOllamaPs();
  const cloudRunning = rawRunning.filter(isCloudModel);

  const enrichedRunning = await Promise.all(
    cloudRunning.map(async (m) => {
      const modelName = m.name || m.model;
      const usage = modelName ? await fetchModelUsage(modelName) : 1;
      return {
        ...m,
        installed: true,
        usage,
      };
    })
  );

  sendJson(res, 200, { models: enrichedRunning });
});
