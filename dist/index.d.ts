#!/usr/bin/env node
import http from "http";
export { createRouter } from "./router.js";
export declare function createServer(options?: {
    router?: http.RequestListener;
}): http.Server;
export declare const server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
export declare function startServer(port?: number, host?: string): http.Server;
