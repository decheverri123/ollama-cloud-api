import type http from "http";
export declare function getCatalogOverview(): Promise<Record<string, unknown>>;
export declare const handleOverview: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<unknown> | unknown;
