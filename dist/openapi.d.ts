export declare const openApiSpec: {
    openapi: string;
    info: {
        title: string;
        version: string;
        description: string;
    };
    servers: {
        url: string;
        description: string;
    }[];
    paths: {
        "/api/show-cloud": {
            get: {
                summary: string;
                description: string;
                parameters: ({
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: string;
                        enum?: undefined;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: boolean;
                        enum?: undefined;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        enum: string[];
                        example: string;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: number;
                        enum?: undefined;
                    };
                })[];
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
            post: {
                summary: string;
                description: string;
                requestBody: {
                    required: boolean;
                    content: {
                        "application/json": {
                            schema: {
                                type: string;
                                properties: {
                                    model: {
                                        type: string;
                                        example: string;
                                    };
                                    verbose: {
                                        type: string;
                                        default: boolean;
                                    };
                                    benchmarks: {
                                        type: string;
                                        default: boolean;
                                    };
                                };
                            };
                        };
                    };
                };
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/api/recommend": {
            get: {
                summary: string;
                description: string;
                parameters: ({
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        enum: string[];
                        example: string;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: number;
                        enum?: undefined;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: string;
                        enum?: undefined;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: boolean;
                        enum?: undefined;
                    };
                })[];
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
            post: {
                summary: string;
                description: string;
                requestBody: {
                    required: boolean;
                    content: {
                        "application/json": {
                            schema: {
                                type: string;
                                properties: {
                                    task: {
                                        type: string;
                                        enum: string[];
                                        example: string;
                                    };
                                    max_usage: {
                                        type: string;
                                        example: number;
                                    };
                                    capability: {
                                        type: string;
                                        example: string;
                                    };
                                    installed: {
                                        type: string;
                                        example: boolean;
                                    };
                                    min_context: {
                                        type: string;
                                        example: number;
                                    };
                                };
                            };
                        };
                    };
                };
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/api/leaderboard": {
            get: {
                summary: string;
                description: string;
                parameters: {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: string;
                    };
                }[];
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/api/compare": {
            get: {
                summary: string;
                description: string;
                parameters: {
                    name: string;
                    in: string;
                    required: boolean;
                    description: string;
                    schema: {
                        type: string;
                        example: string;
                    };
                }[];
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/api/overview": {
            get: {
                summary: string;
                description: string;
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/health": {
            get: {
                summary: string;
                description: string;
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
    };
};
export declare function getOpenApiSpecWithHost(baseUrl: string): {
    servers: {
        url: string;
        description: string;
    }[];
    openapi: string;
    info: {
        title: string;
        version: string;
        description: string;
    };
    paths: {
        "/api/show-cloud": {
            get: {
                summary: string;
                description: string;
                parameters: ({
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: string;
                        enum?: undefined;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: boolean;
                        enum?: undefined;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        enum: string[];
                        example: string;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: number;
                        enum?: undefined;
                    };
                })[];
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
            post: {
                summary: string;
                description: string;
                requestBody: {
                    required: boolean;
                    content: {
                        "application/json": {
                            schema: {
                                type: string;
                                properties: {
                                    model: {
                                        type: string;
                                        example: string;
                                    };
                                    verbose: {
                                        type: string;
                                        default: boolean;
                                    };
                                    benchmarks: {
                                        type: string;
                                        default: boolean;
                                    };
                                };
                            };
                        };
                    };
                };
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/api/recommend": {
            get: {
                summary: string;
                description: string;
                parameters: ({
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        enum: string[];
                        example: string;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: number;
                        enum?: undefined;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: string;
                        enum?: undefined;
                    };
                } | {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: boolean;
                        enum?: undefined;
                    };
                })[];
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
            post: {
                summary: string;
                description: string;
                requestBody: {
                    required: boolean;
                    content: {
                        "application/json": {
                            schema: {
                                type: string;
                                properties: {
                                    task: {
                                        type: string;
                                        enum: string[];
                                        example: string;
                                    };
                                    max_usage: {
                                        type: string;
                                        example: number;
                                    };
                                    capability: {
                                        type: string;
                                        example: string;
                                    };
                                    installed: {
                                        type: string;
                                        example: boolean;
                                    };
                                    min_context: {
                                        type: string;
                                        example: number;
                                    };
                                };
                            };
                        };
                    };
                };
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/api/leaderboard": {
            get: {
                summary: string;
                description: string;
                parameters: {
                    name: string;
                    in: string;
                    description: string;
                    schema: {
                        type: string;
                        example: string;
                    };
                }[];
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/api/compare": {
            get: {
                summary: string;
                description: string;
                parameters: {
                    name: string;
                    in: string;
                    required: boolean;
                    description: string;
                    schema: {
                        type: string;
                        example: string;
                    };
                }[];
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/api/overview": {
            get: {
                summary: string;
                description: string;
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
        "/health": {
            get: {
                summary: string;
                description: string;
                responses: {
                    "200": {
                        description: string;
                        content: {
                            "application/json": {};
                        };
                    };
                };
            };
        };
    };
};
export declare function renderDocsHtml(): string;
