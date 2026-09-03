import type http from "http";
export declare const handlePassthrough: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<unknown> | unknown;
