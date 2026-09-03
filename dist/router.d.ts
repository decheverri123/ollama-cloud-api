import type http from "http";
export declare function createRouter(): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<unknown>;
