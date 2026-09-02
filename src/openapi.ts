/**
 * OpenAPI 3.1 Specification for Scalar docs
 */
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Ollama Cloud API",
    version: "1.0.0",
    description:
      "The missing API for Ollama Cloud models: live numeric usage tiers (1=Low, 2=Medium, 3=High, 4=Extra High), scraped benchmarks, model recommendations, comparisons, and leaderboards.",
  },
  servers: [
    {
      url: "/",
      description: "Current Host",
    },
  ],
  paths: {
    "/api/show-cloud": {
      get: {
        summary: "Get Cloud Models (Full Catalog + Local Installed Status)",
        description:
          "Lists all Ollama Cloud models live from Ollama's catalog, enriched with local installed status (installed: true/false), parameters, template, capabilities, model_info, and numeric usage tiers (1=Low, 2=Medium, 3=High, 4=Extra High).",
        parameters: [
          {
            name: "model",
            in: "query",
            description: "Optional model name to fetch a single model.",
            schema: { type: "string", example: "kimi-k3:cloud" },
          },
          {
            name: "installed",
            in: "query",
            description: "Filter by local installation status (true or false).",
            schema: { type: "boolean", example: true },
          },
          {
            name: "benchmarks",
            in: "query",
            description: "If true, includes benchmark comparison data if available.",
            schema: { type: "boolean", example: true },
          },
          {
            name: "usage",
            in: "query",
            description: "Filter by comma-separated usage tiers (e.g. 1,2).",
            schema: { type: "string", example: "1,2" },
          },
          {
            name: "max_usage",
            in: "query",
            description: "Maximum allowed usage tier (1 to 4).",
            schema: { type: "integer", example: 2 },
          },
          {
            name: "min_usage",
            in: "query",
            description: "Minimum allowed usage tier (1 to 4).",
            schema: { type: "integer", example: 1 },
          },
          {
            name: "capability",
            in: "query",
            description:
              "Filter models possessing required capabilities (e.g. tools,vision,thinking).",
            schema: { type: "string", example: "tools,vision" },
          },
          {
            name: "sort",
            in: "query",
            description: "Sort order.",
            schema: {
              type: "string",
              enum: ["usage", "usage_desc", "name", "size"],
              example: "usage",
            },
          },
          {
            name: "grouped",
            in: "query",
            description: "If true, returns results grouped by usage tier.",
            schema: { type: "boolean", example: false },
          },
        ],
        responses: {
          "200": {
            description: "Successful response",
            content: { "application/json": {} },
          },
        },
      },
      post: {
        summary: "Show Cloud Model Details (POST Body)",
        description: "Fetch enriched cloud model details via JSON request body.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  model: { type: "string", example: "glm-5.3-flash:cloud" },
                  verbose: { type: "boolean", default: true },
                  benchmarks: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Successful response",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/recommend": {
      get: {
        summary: "Smart Model Recommendation & Router",
        description:
          "Recommends the best cloud model matching task requirements (coding, agentic, vision, fast, cheap) and usage limits.",
        parameters: [
          {
            name: "task",
            in: "query",
            description: "Target task: coding, agentic, vision, fast, cheap, general.",
            schema: {
              type: "string",
              enum: ["coding", "agentic", "vision", "fast", "cheap", "general"],
              example: "coding",
            },
          },
          {
            name: "max_usage",
            in: "query",
            description: "Maximum acceptable usage tier (1 to 4).",
            schema: { type: "integer", example: 2 },
          },
          {
            name: "capability",
            in: "query",
            description: "Required capabilities (comma-separated, e.g. tools,vision).",
            schema: { type: "string", example: "tools" },
          },
          {
            name: "installed",
            in: "query",
            description: "If true, only recommends models you currently have installed.",
            schema: { type: "boolean", example: true },
          },
          {
            name: "min_context",
            in: "query",
            description: "Minimum context length required (e.g. 131072 for 128k, 1048576 for 1M).",
            schema: { type: "integer", example: 262144 },
          },
        ],
        responses: {
          "200": {
            description: "Recommended model with reasoning and alternatives",
            content: { "application/json": {} },
          },
        },
      },
      post: {
        summary: "Smart Model Recommendation (JSON Body)",
        description:
          "Same recommendation engine as the GET endpoint, accepting parameters in a JSON request body.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  task: {
                    type: "string",
                    enum: ["coding", "agentic", "vision", "fast", "cheap", "general"],
                    example: "coding",
                  },
                  max_usage: { type: "integer", example: 2 },
                  capability: { type: "string", example: "tools" },
                  installed: { type: "boolean", example: true },
                  min_context: { type: "integer", example: 262144 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Recommended model with reasoning and alternatives",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/chat": {
      post: {
        summary: "Chat Completion (Cloud-Aware)",
        description:
          "Forwards a standard Ollama chat request to the upstream Ollama server. If 'model' is omitted and 'task' is provided, the best matching cloud model is selected automatically. Response includes the model's usage tier via the X-Model-Usage-Tier header.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  model: { type: "string", example: "glm-5.3-flash:cloud" },
                  messages: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        role: { type: "string", example: "user" },
                        content: { type: "string", example: "Hello!" },
                      },
                    },
                  },
                  stream: { type: "boolean", example: false },
                  task: {
                    type: "string",
                    enum: ["coding", "agentic", "vision", "fast", "cheap", "general"],
                    example: "coding",
                  },
                  max_usage: { type: "integer", example: 2 },
                  capability: { type: "string", example: "tools" },
                  min_context: { type: "integer", example: 262144 },
                  installed: { type: "boolean", example: false },
                },
                required: ["messages"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Ollama chat response with optional usage_tier enrichment",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/generate": {
      post: {
        summary: "Generate Completion (Cloud-Aware)",
        description:
          "Forwards a standard Ollama generate request to the upstream Ollama server. If 'model' is omitted and 'task' is provided, the best matching cloud model is selected automatically. Response includes the model's usage tier via the X-Model-Usage-Tier header.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  model: { type: "string", example: "glm-5.3-flash:cloud" },
                  prompt: { type: "string", example: "Write a quicksort in Python." },
                  stream: { type: "boolean", example: false },
                  task: {
                    type: "string",
                    enum: ["coding", "agentic", "vision", "fast", "cheap", "general"],
                    example: "coding",
                  },
                  max_usage: { type: "integer", example: 2 },
                  capability: { type: "string", example: "tools" },
                  min_context: { type: "integer", example: 262144 },
                  installed: { type: "boolean", example: false },
                },
                required: ["prompt"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Ollama generate response with optional usage_tier enrichment",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/leaderboard": {
      get: {
        summary: "Ranked Benchmarks Leaderboard",
        description:
          "Ranks all models by category (Coding, Agentic, Vision) based on scraped benchmark scores.",
        parameters: [
          {
            name: "category",
            in: "query",
            description: "Filter to a specific domain (Coding, Agentic, Vision).",
            schema: { type: "string", example: "Coding" },
          },
        ],
        responses: {
          "200": {
            description: "Ranked categories and models",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/compare": {
      get: {
        summary: "Head-to-Head Model Comparison",
        description:
          "Compares 2 or more cloud models side-by-side (context length, parameter sizes, usage tiers, and benchmark deltas).",
        parameters: [
          {
            name: "models",
            in: "query",
            required: true,
            description: "Comma-separated list of models to compare.",
            schema: {
              type: "string",
              example: "glm-5.3-flash:cloud,glm-5.3:cloud",
            },
          },
        ],
        responses: {
          "200": {
            description: "Side-by-side comparison",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/overview": {
      get: {
        summary: "Catalog Analytics & Overview",
        description:
          "Dashboard metrics covering live catalog size, installed vs uninstalled counts, tier distributions, capabilities breakdown, context lengths, and benchmark coverage.",
        responses: {
          "200": {
            description: "Catalog statistics",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/benchmarks": {
      get: {
        summary: "Get Model Benchmarks",
        description:
          "Retrieves scraped benchmark comparison results from Ollama's library page (Coding, Agentic, Vision, Math).",
        parameters: [
          {
            name: "model",
            in: "query",
            description:
              "Model name (e.g. glm-5.3-flash:cloud). If omitted, returns all cloud models with benchmarks.",
            schema: { type: "string", example: "glm-5.3-flash:cloud" },
          },
        ],
        responses: {
          "200": {
            description: "Benchmark comparison table and categories",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/show-cloud/grouped": {
      get: {
        summary: "Get Cloud Models Grouped by Tier",
        description:
          "Returns all cloud models categorized into 1_low, 2_medium, 3_high, and 4_extra_high.",
        responses: {
          "200": {
            description: "Grouped models",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/tags-cloud": {
      get: {
        summary: "Lightweight Cloud Tags",
        description:
          "Fast tags-compatible endpoint returning only cloud models with usage numbers (1-4) and installed status.",
        parameters: [
          {
            name: "installed",
            in: "query",
            description: "Filter by installed status (true or false).",
            schema: { type: "boolean" },
          },
          {
            name: "usage",
            in: "query",
            description: "Filter by usage tiers (e.g. 1,2).",
            schema: { type: "string" },
          },
          {
            name: "max_usage",
            in: "query",
            description: "Maximum usage tier.",
            schema: { type: "integer" },
          },
          {
            name: "sort",
            in: "query",
            description: "Sort order.",
            schema: {
              type: "string",
              enum: ["usage", "usage_desc", "name", "size"],
            },
          },
        ],
        responses: {
          "200": {
            description: "Cloud tags response",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/ps-cloud": {
      get: {
        summary: "Running Cloud Models",
        description:
          "Lists currently running/loaded Ollama cloud models along with their usage tier.",
        responses: {
          "200": {
            description: "Running cloud models",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/cache/status": {
      get: {
        summary: "Cache Status",
        description:
          "View in-memory usage, benchmark, and catalog cache size, TTL, entries, ages, and time-to-expiry.",
        responses: {
          "200": {
            description: "Cache status details",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/api/cache/clear": {
      post: {
        summary: "Clear All Caches",
        description: "Immediately flushes all cached model usage levels, benchmarks, and catalog lists.",
        responses: {
          "200": {
            description: "Cache cleared",
            content: { "application/json": {} },
          },
        },
      },
      get: {
        summary: "Clear Cache (GET shortcut)",
        description: "Convenience GET endpoint to flush cache.",
        responses: {
          "200": {
            description: "Cache cleared",
            content: { "application/json": {} },
          },
        },
      },
    },
    "/health": {
      get: {
        summary: "Health Check",
        description: "Checks service status and listed endpoints.",
        responses: {
          "200": {
            description: "Health status",
            content: { "application/json": {} },
          },
        },
      },
    },
  },
};

export function getOpenApiSpecWithHost(baseUrl: string) {
  return {
    ...openApiSpec,
    servers: [
      {
        url: baseUrl,
        description: "Current Server",
      },
      {
        url: "/",
        description: "Relative Path",
      },
    ],
  };
}

export function renderDocsHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <title>Ollama Cloud API - Documentation</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🦙</text></svg>">
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/openapi.json"
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}
