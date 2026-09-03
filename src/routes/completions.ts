import type http from "http";
import { OLLAMA_HOST } from "../config.js";
import { recommendModel } from "../services/recommend.js";
import { fetchModelUsage } from "../services/scraper.js";
import { readBody, sendError } from "../utils/http.js";

export async function handleCompletions(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string
): Promise<void> {
  const upstreamPath = pathname;
  const bodyField = pathname === "/api/chat" ? "messages" : "prompt";

  try {
    const rawBody = await readBody(req);
    const payload = JSON.parse(rawBody || "{}");

    let recommendationReason: string | undefined;
    if (!payload.model && payload.task) {
      const rec = await recommendModel({
        task: payload.task,
        maxUsage: payload.max_usage,
        capabilities: payload.capability
          ? payload.capability.split(",").map((c: string) => c.trim().toLowerCase())
          : undefined,
        minContext: payload.min_context,
        onlyInstalled: payload.installed,
      });
      if (rec.recommendation) {
        payload.model = rec.recommendation;
        recommendationReason = rec.reason;
      }
    }

    if (!payload.model) {
      sendError(res, 400, `Missing 'model' field in ${pathname.slice(5)} request`);
      return;
    }

    if (!payload[bodyField]) {
      sendError(res, 400, `Missing '${bodyField}' field in ${pathname.slice(5)} request`);
      return;
    }

    const usage = await fetchModelUsage(payload.model);

    const proxyRes = await fetch(`${OLLAMA_HOST}${upstreamPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseHeaders: Record<string, string> = {
      "Content-Type": proxyRes.headers.get("Content-Type") || "application/json",
      "X-Model-Usage-Tier": String(usage),
    };
    if (recommendationReason) {
      responseHeaders["X-Recommendation-Reason"] = recommendationReason;
    }

    res.writeHead(proxyRes.status, responseHeaders);

    if (payload.stream && proxyRes.body) {
      const reader = proxyRes.body.getReader();
      const pump = (): void => {
        reader.read().then(({ done, value }) => {
          if (done) {
            res.end();
            return;
          }
          res.write(value);
          pump();
        });
      };
      pump();
      return;
    }

    const text = await proxyRes.text();
    if (!payload.stream) {
      try {
        const json = JSON.parse(text);
        json.usage_tier = usage;
        if (recommendationReason) {
          json.recommendation_reason = recommendationReason;
        }
        res.end(JSON.stringify(json));
        return;
      } catch {
        // not JSON; fall through to return upstream text unchanged
      }
    }
    res.end(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const upstreamErr = err as { status?: number; name?: string };
    const status = typeof upstreamErr?.status === "number" ? upstreamErr.status : 502;
    const isConn = upstreamErr?.name === "TypeError" || /fetch failed/i.test(message);
    sendError(res, status, "Failed to reach upstream Ollama server", {
      upstream: `${OLLAMA_HOST}${upstreamPath}`,
      detail: message,
      ...(isConn
        ? { hint: `Could not connect to ${OLLAMA_HOST}. Is Ollama running? Check OLLAMA_HOST env var.` }
        : {}),
    });
  }
}