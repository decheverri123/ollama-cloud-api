import type http from "http";
import type { URL } from "url";
import type { ShowCloudRequest } from "../types.js";
export declare const handleShowCloud: (req: http.IncomingMessage, res: http.ServerResponse, payload: ShowCloudRequest) => Promise<unknown> | unknown;
export declare const handleShowCloudAll: (req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: URL, grouped?: boolean | undefined, includeBenchmarks?: boolean | undefined) => Promise<unknown> | unknown;
