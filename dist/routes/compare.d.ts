import type http from "http";
import type { URL } from "url";
export declare const handleCompare: (req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: URL) => Promise<unknown> | unknown;
