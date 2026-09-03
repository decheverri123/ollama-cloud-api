import type http from "http";
import type { URL } from "url";
export declare const handleLeaderboard: (req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: URL) => Promise<unknown> | unknown;
