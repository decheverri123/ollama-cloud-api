import type http from "http";
import { OLLAMA_HOST } from "../config.js";

export function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", (err) => reject(err));
  });
}

export function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
  headers: Record<string, string> = {}
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...headers,
  });
  res.end(JSON.stringify(data, null, 2));
}

export function sendError(
  res: http.ServerResponse,
  statusCode: number,
  error: string,
  extra: Record<string, unknown> = {}
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error, ...extra }));
}

type RouteHandler<Args extends unknown[] = unknown[]> = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ...rest: Args
) => Promise<unknown> | unknown;

export function withError<Args extends unknown[] = unknown[]>(
  handler: RouteHandler<Args>,
  upstreamContext?: { path: string }
): RouteHandler<Args> {
  return async (req, res, ...rest) => {
    try {
      return await handler(req, res, ...rest);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${req.method} ${req.url}]`, message);
      if (upstreamContext) {
        const isUpstreamConn = /fetch failed|TypeError: fetch/i.test(message);
        sendError(res, 502, "Failed to reach upstream Ollama server", {
          upstream: `${OLLAMA_HOST}${upstreamContext.path}`,
          detail: message,
          ...(isUpstreamConn
            ? {
                hint: `Could not connect to ${OLLAMA_HOST}. Is Ollama running? Check OLLAMA_HOST env var.`,
              }
            : {}),
        });
        return;
      }
      const status = /Invalid JSON/.test(message)
        ? 400
        : /missing .* field/i.test(message)
          ? 400
          : 500;
      sendError(res, status, message);
    }
  };
}
