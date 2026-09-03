import type http from "http";
export declare function readBody(req: http.IncomingMessage): Promise<string>;
export declare function sendJson(res: http.ServerResponse, statusCode: number, data: unknown, headers?: Record<string, string>): void;
export declare function sendError(res: http.ServerResponse, statusCode: number, error: string, extra?: Record<string, unknown>): void;
type RouteHandler<Args extends unknown[] = unknown[]> = (req: http.IncomingMessage, res: http.ServerResponse, ...rest: Args) => Promise<unknown> | unknown;
export declare function withError<Args extends unknown[] = unknown[]>(handler: RouteHandler<Args>, upstreamContext?: {
    path: string;
}): RouteHandler<Args>;
export {};
