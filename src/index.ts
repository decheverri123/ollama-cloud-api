#!/usr/bin/env node
import http from "http";
import { URL } from "url";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const PORT = parseInt(process.env.PORT || "11435", 10);

// In-memory cache for usage data (TTL: 10 minutes)
interface UsageCacheEntry {
  usage: number;
  timestamp: number;
}
const usageCache = new Map<string, UsageCacheEntry>();

// In-memory cache for benchmarks data (TTL: 10 minutes)
interface BenchmarkCacheEntry {
  data: Record<string, any> | null;
  timestamp: number;
}
const benchmarkCache = new Map<string, BenchmarkCacheEntry>();

const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Maps cloud usage string levels to numeric tiers (1 - 4):
 * 1 = Low
 * 2 = Medium
 * 3 = High
 * 4 = Extra High
 */
export function parseUsageLevel(usageText: string | null): number {
  if (!usageText) return 1;
  const normalized = usageText.trim().toLowerCase();
  switch (normalized) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    case "extra high":
    case "extra-high":
    case "very high":
    case "very-high":
      return 4;
    default:
      const num = parseInt(normalized, 10);
      return isNaN(num) || num < 1 ? 1 : Math.min(num, 4);
  }
}

/**
 * Checks if a model is an Ollama Cloud model.
 */
export function isCloudModel(model: {
  name?: string;
  model?: string;
  remote_host?: string;
  remote_model?: string;
  [key: string]: any;
}): boolean {
  return Boolean(
    model.remote_host ||
      model.remote_model ||
      model.name?.endsWith(":cloud") ||
      model.model?.endsWith(":cloud") ||
      model.name?.includes(":cloud") ||
      model.model?.includes(":cloud")
  );
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*/g, "")
    .trim();
}

/**
 * Parses markdown table text from Ollama model page into structured JSON.
 */
export function parseMarkdownTable(tableText: string): Record<string, any> | null {
  const lines = tableText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && l.endsWith("|"));

  if (lines.length < 2) return null;

  // Header line
  const headerLine = lines[0];
  const headers = headerLine
    .split("|")
    .slice(1, -1)
    .map((h) => decodeHtmlEntities(h));

  const modelHeaders = headers.slice(1);
  const rows: Array<{
    benchmark: string;
    category: string;
    scores: Record<string, number | string | null>;
  }> = [];

  let currentCategory = "General";
  const categoriesSet = new Set<string>();

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => decodeHtmlEntities(c));

    if (cells.length === 0) continue;

    const firstCell = cells[0];
    const otherCells = cells.slice(1);

    // Check if category header row (e.g. | **Coding** | | | ...)
    const hasOtherValues = otherCells.some((c) => c !== "" && c !== "-");
    if (!hasOtherValues && firstCell) {
      currentCategory = firstCell;
      categoriesSet.add(currentCategory);
      continue;
    }

    if (!firstCell) continue;

    const scores: Record<string, number | string | null> = {};
    modelHeaders.forEach((modelName, idx) => {
      const val = otherCells[idx];
      if (val !== undefined && val !== "" && val !== "–" && val !== "-") {
        const num = parseFloat(val);
        scores[modelName] = isNaN(num) ? val : num;
      } else {
        scores[modelName] = null;
      }
    });

    categoriesSet.add(currentCategory);
    rows.push({
      benchmark: firstCell,
      category: currentCategory,
      scores,
    });
  }

  if (rows.length === 0) return null;

  return {
    models: modelHeaders,
    benchmarks_count: rows.length,
    categories: Array.from(categoriesSet),
    rows,
  };
}

/**
 * Parses all HTML tables from Ollama model page (focusing on #display > table).
 */
export function parseAllHtmlTables(displayHtml: string): Record<string, any> | null {
  const tableMatches = displayHtml.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || [];
  if (tableMatches.length === 0) return null;

  let allModels: string[] = [];
  const allRows: Array<{
    benchmark: string;
    category: string;
    scores: Record<string, number | string | null>;
  }> = [];
  const categoriesSet = new Set<string>();

  for (const tableHtml of tableMatches) {
    // Extract headers: can be in <thead> or first <tr>
    const thMatches = Array.from(tableHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi));
    let headers: string[] = [];
    if (thMatches.length >= 2) {
      headers = thMatches.map((m) =>
        decodeHtmlEntities(m[1].replace(/<[^>]*>/g, ""))
      );
    } else {
      const firstTr = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
      if (firstTr) {
        const firstTds = Array.from(firstTr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi));
        if (firstTds.length >= 2) {
          headers = firstTds.map((m) =>
            decodeHtmlEntities(m[1].replace(/<[^>]*>/g, ""))
          );
        }
      }
    }

    if (headers.length < 2) continue;

    const modelHeaders = headers.slice(1).map((h) => h || "Score");
    allModels = Array.from(new Set([...allModels, ...modelHeaders]));

    // Extract table rows
    const trMatches = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    let currentCategory = "General";

    for (let i = 0; i < trMatches.length; i++) {
      const tr = trMatches[i][1];

      // Skip if this is the header row
      if (tr.includes("<th") && i === 0) continue;

      const tdMatches = Array.from(tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi));
      if (tdMatches.length === 0) continue;

      // Check for colspan or single category cell
      if (tdMatches.length === 1 || tr.includes("colspan")) {
        const catName = decodeHtmlEntities(tdMatches[0][1].replace(/<[^>]*>/g, ""));
        if (catName) {
          currentCategory = catName;
          categoriesSet.add(currentCategory);
        }
        continue;
      }

      const cells = tdMatches.map((m) =>
        decodeHtmlEntities(m[1].replace(/<[^>]*>/g, ""))
      );
      const firstCell = cells[0];
      const otherCells = cells.slice(1);

      // Check if category row where other cells are empty
      const hasOtherValues = otherCells.some(
        (c) => c !== "" && c !== "-" && c !== "–"
      );
      if (!hasOtherValues && firstCell) {
        currentCategory = firstCell;
        categoriesSet.add(currentCategory);
        continue;
      }

      if (!firstCell) continue;

      const scores: Record<string, number | string | null> = {};
      modelHeaders.forEach((modelName, idx) => {
        const val = otherCells[idx];
        if (val !== undefined && val !== "" && val !== "–" && val !== "-") {
          const cleaned = val.replace(/%/g, "").trim();
          const num = parseFloat(cleaned);
          scores[modelName] = isNaN(num) ? val : num;
        } else {
          scores[modelName] = null;
        }
      });

      categoriesSet.add(currentCategory);
      allRows.push({
        benchmark: firstCell,
        category: currentCategory,
        scores,
      });
    }
  }

  if (allRows.length === 0) return null;

  return {
    models: allModels,
    benchmarks_count: allRows.length,
    categories: Array.from(categoriesSet),
    rows: allRows,
  };
}

/**
 * Scrapes Ollama's library page for model benchmarks focusing on #display > table.
 */
export async function fetchModelBenchmarks(
  modelName: string
): Promise<Record<string, any> | null> {
  const cached = benchmarkCache.get(modelName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const cleanName = modelName.replace(/:cloud$/, "");
  const urls = [
    `https://ollama.com/library/${modelName}`,
    `https://ollama.com/library/${cleanName}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();

      // 1. Primary: Extract #display content (document.querySelector("#display"))
      const displayMatch = html.match(/id="display"[^>]*>([\s\S]*?)<\/div>/i);
      const targetHtml = displayMatch ? displayMatch[1] : html;

      const parsedHtml = parseAllHtmlTables(targetHtml);
      if (parsedHtml) {
        benchmarkCache.set(modelName, { data: parsedHtml, timestamp: Date.now() });
        return parsedHtml;
      }

      // 2. Secondary fallback: markdown table in textarea
      const benchMarkdownMatch = html.match(
        /#+\s*Benchmarks[\s\S]*?(\|[\s\S]*?\|(?:\r?\n\s*\r?\n|(?=\s*#)|$))/i
      );
      if (benchMarkdownMatch) {
        const parsed = parseMarkdownTable(benchMarkdownMatch[1]);
        if (parsed) {
          benchmarkCache.set(modelName, { data: parsed, timestamp: Date.now() });
          return parsed;
        }
      }
    } catch {
      // Continue to fallback URL
    }
  }

  benchmarkCache.set(modelName, { data: null, timestamp: Date.now() });
  return null;
}

/**
 * Scrapes Ollama's library web page for the model's cloud usage level
 * and converts it to a tier number (1 - 4).
 */
export async function fetchModelUsage(modelName: string): Promise<number> {
  const cached = usageCache.get(modelName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.usage;
  }

  const cleanName = modelName.replace(/:cloud$/, "");
  const urls = [
    `https://ollama.com/library/${modelName}`,
    `https://ollama.com/library/${cleanName}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();

      // Extract Usage section text
      const usageMatch = html.match(
        /Usage<\/div>\s*<div[^>]*>[\s\S]*?<span[^>]*class="[^"]*min-w-0 break-words[^"]*"[^>]*>([^<]+)<\/span>/i
      );

      if (usageMatch && usageMatch[1]) {
        const usage = parseUsageLevel(usageMatch[1]);
        usageCache.set(modelName, { usage, timestamp: Date.now() });
        return usage;
      }
    } catch {
      // Continue to next fallback URL
    }
  }

  return 1;
}

/**
 * Fetch raw tags from Ollama API
 */
async function fetchOllamaTags(): Promise<Array<Record<string, any>>> {
  const res = await fetch(`${OLLAMA_HOST}/api/tags`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Ollama returned status ${res.status}`);
  }
  const data = (await res.json()) as { models?: Array<Record<string, any>> };
  return data.models || [];
}

/**
 * Fetch raw ps (running models) from Ollama API
 */
async function fetchOllamaPs(): Promise<Array<Record<string, any>>> {
  const res = await fetch(`${OLLAMA_HOST}/api/ps`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Ollama returned status ${res.status}`);
  }
  const data = (await res.json()) as { models?: Array<Record<string, any>> };
  return data.models || [];
}

async function getEnrichedModelData(
  modelName: string,
  verbose = true,
  includeBenchmarks = false
) {
  // 1. Fetch from local Ollama instance
  const ollamaPromise = fetch(`${OLLAMA_HOST}/api/show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName, verbose }),
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text();
      throw new Error(text || `Ollama returned status ${r.status}`);
    }
    return r.json();
  });

  // 2. Fetch usage in parallel
  const usagePromise = fetchModelUsage(modelName);

  // 3. Fetch benchmarks in parallel if requested
  const benchmarkPromise = includeBenchmarks
    ? fetchModelBenchmarks(modelName)
    : Promise.resolve(null);

  const [modelDetails, usage, benchmarks] = (await Promise.all([
    ollamaPromise,
    usagePromise,
    benchmarkPromise,
  ])) as [Record<string, any>, number, Record<string, any> | null];

  const res: Record<string, any> = {
    ...modelDetails,
    usage: usage || 1,
  };

  if (includeBenchmarks) {
    res.benchmarks = benchmarks;
  }

  return res;
}

/**
 * Applies filters (usage, max_usage, min_usage, capability) and sorting to a list of models.
 */
function applyFiltersAndSort(
  models: Array<Record<string, any>>,
  searchParams: URLSearchParams
): Array<Record<string, any>> {
  let result = [...models];

  // Filter: usage exact list e.g. ?usage=1,2
  const usageFilter = searchParams.get("usage");
  if (usageFilter) {
    const allowed = usageFilter.split(",").map((u) => parseInt(u.trim(), 10));
    result = result.filter((m) => allowed.includes(m.usage));
  }

  // Filter: max_usage e.g. ?max_usage=2
  const maxUsage = searchParams.get("max_usage");
  if (maxUsage) {
    const max = parseInt(maxUsage, 10);
    if (!isNaN(max)) {
      result = result.filter((m) => m.usage <= max);
    }
  }

  // Filter: min_usage e.g. ?min_usage=2
  const minUsage = searchParams.get("min_usage");
  if (minUsage) {
    const min = parseInt(minUsage, 10);
    if (!isNaN(min)) {
      result = result.filter((m) => m.usage >= min);
    }
  }

  // Filter: capability e.g. ?capability=tools,vision
  const capabilityFilter = searchParams.get("capability");
  if (capabilityFilter) {
    const requiredCaps = capabilityFilter
      .split(",")
      .map((c) => c.trim().toLowerCase());
    result = result.filter((m) => {
      const caps = Array.isArray(m.capabilities)
        ? m.capabilities.map((c: string) => String(c).toLowerCase())
        : [];
      return requiredCaps.every((req) => caps.includes(req));
    });
  }

  // Sorting
  const sort = searchParams.get("sort");
  if (sort === "usage" || sort === "usage_asc") {
    result.sort((a, b) => (a.usage || 0) - (b.usage || 0));
  } else if (sort === "usage_desc") {
    result.sort((a, b) => (b.usage || 0) - (a.usage || 0));
  } else if (sort === "name") {
    result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else if (sort === "size") {
    result.sort((a, b) => (b.size || 0) - (a.size || 0));
  }

  return result;
}

/**
 * Group models into tiers: 1_low, 2_medium, 3_high, 4_extra_high
 */
function groupModelsByTier(models: Array<Record<string, any>>) {
  const grouped: Record<string, Array<Record<string, any>>> = {
    "1_low": [],
    "2_medium": [],
    "3_high": [],
    "4_extra_high": [],
  };

  const tierMap: Record<number, string> = {
    1: "1_low",
    2: "2_medium",
    3: "3_high",
    4: "4_extra_high",
  };

  for (const m of models) {
    const key = tierMap[m.usage] || "1_low";
    grouped[key].push(m);
  }

  return grouped;
}

/**
 * Normalizes model names for matching between Ollama tags and benchmark headers.
 */
function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/:cloud$/, "")
    .replace(/[-_.]/g, "")
    .replace(/\s+/g, "");
}

function normalizeTokens(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/:cloud$/, "")
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Robustly matches and extracts a model's benchmark score from a table row's score map.
 */
export function extractModelScore(
  scores: Record<string, number | string | null>,
  modelName: string
): number | string | null {
  if (!scores || Object.keys(scores).length === 0) return null;

  const modTokens = normalizeTokens(modelName);

  // 1. Direct exact or normalized string match
  const normMod = modelName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [col, val] of Object.entries(scores)) {
    if (val === null || val === undefined) continue;
    const normCol = col.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      normCol === normMod ||
      normCol.includes(normMod) ||
      normMod.includes(normCol)
    ) {
      return val;
    }
  }

  // 2. Token overlap match (e.g. "V4-Flash High" for "deepseek-v4-flash")
  let bestCandidateVal: number | string | null = null;
  let bestScoreNum = -1;

  for (const [col, val] of Object.entries(scores)) {
    if (val === null || val === undefined) continue;
    const colTokens = normalizeTokens(col);

    const colCore = colTokens.filter(
      (t) =>
        ![
          "non",
          "think",
          "thinking",
          "high",
          "max",
          "dense",
          "moe",
          "score",
          "verified",
        ].includes(t)
    );
    const modCore = modTokens.filter(
      (t) => !["model", "cloud", "latest"].includes(t)
    );

    const matchesAllCol =
      colCore.length > 0 && colCore.every((t) => modCore.includes(t));
    const matchesAllMod =
      modCore.length > 0 && modCore.every((t) => colTokens.includes(t));
    const commonTokens = colCore.filter((t) => modCore.includes(t));
    const keyTokensMatch = commonTokens.length >= 2;

    if (matchesAllCol || matchesAllMod || keyTokensMatch) {
      if (typeof val === "number") {
        if (
          col.toLowerCase().includes("high") ||
          col.toLowerCase().includes("max") ||
          val > bestScoreNum
        ) {
          bestCandidateVal = val;
          bestScoreNum = val;
        }
      } else if (!bestCandidateVal) {
        bestCandidateVal = val;
      }
    }
  }

  return bestCandidateVal;
}

/**
 * Computes ranked leaderboards from scraped benchmarks across all models.
 */
function computeLeaderboard(
  benchmarkDataList: Array<{ model: string; data: Record<string, any> }>,
  usageMap: Map<string, number>
) {
  const categoryModelScores: Record<
    string,
    Record<string, { total: number; count: number; benchmarks: Record<string, number> }>
  > = {};

  for (const item of benchmarkDataList) {
    const rows = item.data.rows || [];
    for (const row of rows) {
      const category = row.category || "General";
      if (!categoryModelScores[category]) {
        categoryModelScores[category] = {};
      }

      for (const [modelName, score] of Object.entries(row.scores || {})) {
        if (score === null || typeof score !== "number") continue;
        if (!categoryModelScores[category][modelName]) {
          categoryModelScores[category][modelName] = {
            total: 0,
            count: 0,
            benchmarks: {},
          };
        }
        categoryModelScores[category][modelName].total += score;
        categoryModelScores[category][modelName].count += 1;
        categoryModelScores[category][modelName].benchmarks[row.benchmark] = score;
      }
    }
  }

  const leaderboards: Record<string, Array<Record<string, any>>> = {};

  for (const [category, modelsObj] of Object.entries(categoryModelScores)) {
    const ranked = Object.entries(modelsObj)
      .map(([name, stat]) => {
        const avg = Math.round((stat.total / stat.count) * 10) / 10;
        // Attempt to find usage tier
        let usage = 2;
        for (const [mod, u] of usageMap.entries()) {
          const matchedScore = extractModelScore({ [name]: 1 }, mod);
          if (matchedScore !== null) {
            usage = u;
            break;
          }
        }

        return {
          rank: 0,
          model: name,
          average_score: avg,
          benchmarks_evaluated: stat.count,
          usage_tier: usage,
          scores: stat.benchmarks,
        };
      })
      .sort((a, b) => b.average_score - a.average_score);

    ranked.forEach((item, index) => {
      item.rank = index + 1;
    });

    leaderboards[category] = ranked;
  }

  return leaderboards;
}

/**
 * OpenAPI 3.1 Specification for Scalar docs
 */
const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Ollama Cloud API",
    version: "1.0.0",
    description:
      "The missing API for Ollama Cloud models: live numeric usage tiers (1=Low, 2=Medium, 3=High, 4=Extra High), scraped benchmarks, model recommendations, comparisons, and leaderboards.",
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: "Local Proxy Server",
    },
  ],
  paths: {
    "/api/show-cloud": {
      get: {
        summary: "Get Cloud Models (Full Details + Usage)",
        description:
          "Lists all Ollama Cloud models with full show metadata (parameters, template, capabilities, model_info) and numeric cloud usage tiers (1=Low, 2=Medium, 3=High, 4=Extra High).",
        parameters: [
          {
            name: "model",
            in: "query",
            description: "Optional model name to fetch a single model.",
            schema: { type: "string", example: "kimi-k3:cloud" },
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
          "Dashboard metrics covering tier distributions, capabilities breakdown, context lengths, and benchmark coverage.",
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
          "Fast tags-compatible endpoint returning only cloud models with usage numbers (1-4).",
        parameters: [
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
          "View in-memory usage & benchmark cache size, TTL, entries, ages, and time-to-expiry.",
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
        summary: "Clear Usage & Benchmark Cache",
        description: "Immediately flushes all cached model usage levels and benchmarks.",
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

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent, Accept");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  // 1. OpenAPI & Scalar Documentation
  if (pathname === "/openapi.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(openApiSpec, null, 2));
  }

  if (pathname === "/docs" || pathname === "/reference") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html>
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
</html>`);
  }

  // 2. Health check endpoint
  if (pathname === "/" || pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify(
        {
          status: "ok",
          service: "ollama-cloud-api",
          ollama_host: OLLAMA_HOST,
          docs_url: `http://localhost:${PORT}/docs`,
          openapi_url: `http://localhost:${PORT}/openapi.json`,
          endpoints: [
            "/api/show-cloud",
            "/api/show-cloud/grouped",
            "/api/recommend",
            "/api/leaderboard",
            "/api/compare?models=<m1>,<m2>",
            "/api/overview",
            "/api/benchmarks",
            "/api/benchmarks?model=<name>",
            "/api/tags-cloud",
            "/api/ps-cloud",
            "/api/cache/status",
            "/api/cache/clear",
            "/docs",
            "/openapi.json",
            "/api/tags",
            "/health",
          ],
        },
        null,
        2
      )
    );
  }

  // 3. Catalog Overview & Analytics (/api/overview)
  if (pathname === "/api/overview" || pathname === "/overview") {
    try {
      const rawModels = await fetchOllamaTags();
      const cloudModels = rawModels.filter(isCloudModel);

      const usageDist: Record<string, number> = {
        "1_low": 0,
        "2_medium": 0,
        "3_high": 0,
        "4_extra_high": 0,
      };

      const capabilitiesCount: Record<string, number> = {};
      let longContextCount = 0; // 1M+
      const modelsWithBenchmarks: string[] = [];

      await Promise.all(
        cloudModels.map(async (m) => {
          const name = m.name || m.model;
          if (!name) return;
          const u = await fetchModelUsage(name);
          const key =
            u === 1 ? "1_low" : u === 2 ? "2_medium" : u === 3 ? "3_high" : "4_extra_high";
          usageDist[key] = (usageDist[key] || 0) + 1;

          if (Array.isArray(m.capabilities)) {
            for (const cap of m.capabilities) {
              capabilitiesCount[cap] = (capabilitiesCount[cap] || 0) + 1;
            }
          }

          const ctx =
            m.model_info?.context_length ||
            m.details?.context_length ||
            m.model_info?.[`${m.details?.family}.context_length`];
          if (ctx && ctx >= 1000000) {
            longContextCount += 1;
          }

          const bench = await fetchModelBenchmarks(name);
          if (bench) {
            modelsWithBenchmarks.push(name);
          }
        })
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify(
          {
            total_cloud_models: cloudModels.length,
            total_local_models: rawModels.length - cloudModels.length,
            usage_tier_distribution: usageDist,
            capabilities_breakdown: capabilitiesCount,
            models_with_1m_context_count: longContextCount,
            models_with_benchmarks_count: modelsWithBenchmarks.length,
            models_with_benchmarks: modelsWithBenchmarks,
            cache: {
              cached_usage_entries: usageCache.size,
              cached_benchmarks_entries: benchmarkCache.size,
            },
          },
          null,
          2
        )
      );
    } catch (err: any) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 4. Leaderboard endpoint (/api/leaderboard)
  if (pathname === "/api/leaderboard" || pathname === "/leaderboard") {
    try {
      const rawModels = await fetchOllamaTags();
      const cloudModels = rawModels.filter(isCloudModel);

      const usageMap = new Map<string, number>();
      const benchDataList: Array<{ model: string; data: Record<string, any> }> = [];

      await Promise.all(
        cloudModels.map(async (m) => {
          const name = m.name || m.model;
          if (!name) return;
          const u = await fetchModelUsage(name);
          usageMap.set(name, u);

          const b = await fetchModelBenchmarks(name);
          if (b) {
            benchDataList.push({ model: name, data: b });
          }
        })
      );

      const leaderboards = computeLeaderboard(benchDataList, usageMap);
      const requestedCat = parsedUrl.searchParams.get("category");

      if (requestedCat && leaderboards[requestedCat]) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify(
            { category: requestedCat, leaderboard: leaderboards[requestedCat] },
            null,
            2
          )
        );
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify(
          {
            categories: Object.keys(leaderboards),
            leaderboards,
          },
          null,
          2
        )
      );
    } catch (err: any) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 5. Compare models endpoint (/api/compare)
  if (pathname === "/api/compare" || pathname === "/compare") {
    const modelsParam = parsedUrl.searchParams.get("models");
    if (!modelsParam) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: "Missing ?models= query parameter (e.g. ?models=glm-5.3-flash:cloud,glm-5.3:cloud)",
        })
      );
    }

    const modelNames = modelsParam.split(",").map((m) => m.trim());
    try {
      const comparedModels = await Promise.all(
        modelNames.map(async (name) => {
          const enriched = await getEnrichedModelData(name, true, true);
          return {
            name,
            usage: enriched.usage,
            details: enriched.details,
            capabilities: enriched.capabilities || [],
            model_info: enriched.model_info || {},
            benchmarks: enriched.benchmarks,
          };
        })
      );

      // Extract direct benchmark comparison
      const allBenchmarkNames = new Set<string>();
      for (const m of comparedModels) {
        if (m.benchmarks?.rows) {
          for (const r of m.benchmarks.rows) {
            allBenchmarkNames.add(r.benchmark);
          }
        }
      }

      const benchmarkComparison: Array<{
        benchmark: string;
        scores: Record<string, number | string | null>;
      }> = [];

      for (const bName of allBenchmarkNames) {
        const scores: Record<string, number | string | null> = {};
        for (const m of comparedModels) {
          let score: number | string | null = null;
          if (m.benchmarks?.rows) {
            const foundRow = m.benchmarks.rows.find((r: any) => r.benchmark === bName);
            if (foundRow) {
              score = extractModelScore(foundRow.scores || {}, m.name);
            }
          }
          if (score === null) {
            for (const other of comparedModels) {
              if (other.name !== m.name && other.benchmarks?.rows) {
                const foundRow = other.benchmarks.rows.find(
                  (r: any) => r.benchmark === bName
                );
                if (foundRow) {
                  const crossScore = extractModelScore(foundRow.scores || {}, m.name);
                  if (crossScore !== null) {
                    score = crossScore;
                    break;
                  }
                }
              }
            }
          }
          scores[m.name] = score;
        }
        benchmarkComparison.push({ benchmark: bName, scores });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify(
          {
            compared_models: comparedModels.map((m) => ({
              name: m.name,
              usage: m.usage,
              parameter_size: m.details?.parameter_size,
              quantization_level: m.details?.quantization_level,
              capabilities: m.capabilities,
              context_length:
                m.model_info?.context_length ||
                m.model_info?.[`${m.details?.family}.context_length`],
            })),
            benchmark_comparison: benchmarkComparison,
          },
          null,
          2
        )
      );
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 6. Smart Recommendation endpoint (/api/recommend)
  if (pathname === "/api/recommend" || pathname === "/recommend") {
    const task = (parsedUrl.searchParams.get("task") || "coding").toLowerCase();
    const maxUsageParam = parsedUrl.searchParams.get("max_usage");
    const maxUsage = maxUsageParam ? parseInt(maxUsageParam, 10) : 4;
    const reqCaps = parsedUrl.searchParams.get("capability")
      ? parsedUrl.searchParams
          .get("capability")!
          .split(",")
          .map((c) => c.trim().toLowerCase())
      : [];
    const minContextParam = parsedUrl.searchParams.get("min_context");
    const minContext = minContextParam ? parseInt(minContextParam, 10) : 0;

    try {
      const rawModels = await fetchOllamaTags();
      const cloudModels = rawModels.filter(isCloudModel);

      const enrichedList = await Promise.all(
        cloudModels.map(async (m) => {
          const name = m.name || m.model;
          if (!name) return null;
          const u = await fetchModelUsage(name);
          const b = await fetchModelBenchmarks(name);
          return {
            ...m,
            usage: u,
            benchmarks: b,
          };
        })
      );

      const validModels = enrichedList.filter(Boolean) as Array<Record<string, any>>;

      // Filter by constraints
      let candidates = validModels.filter((m) => {
        if (m.usage > maxUsage) return false;

        if (reqCaps.length > 0) {
          const caps = Array.isArray(m.capabilities)
            ? m.capabilities.map((c: string) => String(c).toLowerCase())
            : [];
          if (!reqCaps.every((c) => caps.includes(c))) return false;
        }

        const ctx =
          m.model_info?.context_length ||
          m.details?.context_length ||
          m.model_info?.[`${m.details?.family}.context_length`] ||
          0;
        if (minContext > 0 && ctx < minContext) return false;

        return true;
      });

      if (candidates.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify(
            {
              task,
              max_usage: maxUsage,
              recommendation: null,
              message: "No cloud models match the requested constraints.",
            },
            null,
            2
          )
        );
      }

      // Rank candidates according to task
      const scoredCandidates = candidates.map((m) => {
        let score = 50; // base score
        let reason = "";

        const name = m.name || m.model;
        const caps = Array.isArray(m.capabilities)
          ? m.capabilities.map((c: string) => String(c).toLowerCase())
          : [];

        // Bonus for low usage (efficiency)
        score += (4 - m.usage) * 10;

        if (task === "coding") {
          // If benchmark has Coding category, extract average
          const rows = m.benchmarks?.rows || [];
          const codingRows = rows.filter(
            (r: any) => r.category?.toLowerCase() === "coding" || r.category?.toLowerCase() === "coding agent"
          );
          if (codingRows.length > 0) {
            let total = 0;
            let cnt = 0;
            for (const r of codingRows) {
              const scoreVal = extractModelScore(r.scores || {}, name);
              if (typeof scoreVal === "number") {
                total += scoreVal;
                cnt += 1;
              }
            }
            if (cnt > 0) {
              const avg = total / cnt;
              score += avg;
              reason = `High coding benchmark average of ${Math.round(avg * 10) / 10}% on ${cnt} coding benchmarks`;
            }
          }
          if (caps.includes("tools")) score += 15;
          if (caps.includes("thinking")) score += 10;
          if (!reason) reason = `Supports coding with capabilities [${caps.join(", ")}] at tier ${m.usage}`;
        } else if (task === "agentic") {
          const rows = m.benchmarks?.rows || [];
          const agenticRows = rows.filter(
            (r: any) => r.category?.toLowerCase() === "agentic" || r.category?.toLowerCase() === "general agent"
          );
          if (agenticRows.length > 0) {
            let total = 0;
            let cnt = 0;
            for (const r of agenticRows) {
              const scoreVal = extractModelScore(r.scores || {}, name);
              if (typeof scoreVal === "number") {
                total += scoreVal;
                cnt += 1;
              }
            }
            if (cnt > 0) {
              const avg = total / cnt;
              score += avg;
              reason = `Top agentic benchmark average of ${Math.round(avg * 10) / 10}%`;
            }
          }
          if (caps.includes("tools")) score += 25;
          if (caps.includes("thinking")) score += 15;
          if (!reason) reason = `Agent-ready model with tool calling at tier ${m.usage}`;
        } else if (task === "vision") {
          if (!caps.includes("vision")) {
            score -= 100;
          } else {
            score += 40;
            reason = `Multimodal vision model at usage tier ${m.usage}`;
          }
        } else if (task === "fast" || task === "cheap") {
          score += (4 - m.usage) * 30;
          reason = `Lowest usage tier (${m.usage}) for high throughput and quota preservation`;
        } else {
          score += (4 - m.usage) * 15;
          reason = `Balanced general-purpose cloud model at tier ${m.usage}`;
        }

        return {
          model: name,
          usage: m.usage,
          capabilities: caps,
          score: Math.round(score * 10) / 10,
          reason,
        };
      });

      scoredCandidates.sort((a, b) => b.score - a.score);
      const top = scoredCandidates[0];
      const alternatives = scoredCandidates.slice(1, 4);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify(
          {
            task,
            max_usage: maxUsage,
            recommendation: top.model,
            usage_tier: top.usage,
            score: top.score,
            reason: top.reason,
            capabilities: top.capabilities,
            alternatives,
          },
          null,
          2
        )
      );
    } catch (err: any) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 7. Benchmarks endpoint (/api/benchmarks)
  if (pathname === "/api/benchmarks" || pathname === "/benchmarks") {
    const model = parsedUrl.searchParams.get("model");
    if (model) {
      try {
        const benchmarks = await fetchModelBenchmarks(model);
        if (!benchmarks) {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify(
              {
                model,
                has_benchmarks: false,
                message: "No benchmark data found on Ollama library page for this model.",
              },
              null,
              2
            )
          );
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify(
            {
              model,
              has_benchmarks: true,
              ...benchmarks,
            },
            null,
            2
          )
        );
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    // List benchmarks for all installed cloud models
    try {
      const rawModels = await fetchOllamaTags();
      const cloudModels = rawModels.filter(isCloudModel);

      const benchmarkResults = await Promise.all(
        cloudModels.map(async (m) => {
          const modelName = m.name || m.model;
          if (!modelName) return null;
          const data = await fetchModelBenchmarks(modelName);
          if (!data) return null;
          return {
            model: modelName,
            ...data,
          };
        })
      );

      const available = benchmarkResults.filter(Boolean);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify(
          {
            models_with_benchmarks_count: available.length,
            models: available,
          },
          null,
          2
        )
      );
    } catch (err: any) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: `Failed to fetch benchmarks: ${err.message}`,
        })
      );
    }
  }

  // 8. Cache status and clear endpoints
  if (pathname === "/api/cache/status") {
    const now = Date.now();
    const usageEntries = Array.from(usageCache.entries()).map(([model, entry]) => ({
      model,
      usage: entry.usage,
      age_seconds: Math.round((now - entry.timestamp) / 1000),
      expires_in_seconds: Math.max(
        0,
        Math.round((CACHE_TTL_MS - (now - entry.timestamp)) / 1000)
      ),
    }));

    const benchmarkEntries = Array.from(benchmarkCache.entries()).map(
      ([model, entry]) => ({
        model,
        has_data: entry.data !== null,
        age_seconds: Math.round((now - entry.timestamp) / 1000),
        expires_in_seconds: Math.max(
          0,
          Math.round((CACHE_TTL_MS - (now - entry.timestamp)) / 1000)
        ),
      })
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify(
        {
          cached_usage_count: usageCache.size,
          cached_benchmarks_count: benchmarkCache.size,
          ttl_seconds: CACHE_TTL_MS / 1000,
          usage_entries: usageEntries,
          benchmark_entries: benchmarkEntries,
        },
        null,
        2
      )
    );
  }

  if (pathname === "/api/cache/clear") {
    const count = usageCache.size + benchmarkCache.size;
    usageCache.clear();
    benchmarkCache.clear();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        status: "ok",
        message: `Usage and benchmark caches cleared successfully (${count} entries removed)`,
      })
    );
  }

  // 9. Lightweight Cloud Tags endpoint (/api/tags-cloud)
  if (pathname === "/api/tags-cloud" || pathname === "/tags-cloud") {
    try {
      const rawModels = await fetchOllamaTags();
      const cloudModels = rawModels.filter(isCloudModel);

      const enrichedTags = await Promise.all(
        cloudModels.map(async (m) => {
          const modelName = m.name || m.model;
          const usage = modelName ? await fetchModelUsage(modelName) : 1;
          return {
            ...m,
            usage,
          };
        })
      );

      const filtered = applyFiltersAndSort(enrichedTags, parsedUrl.searchParams);

      if (parsedUrl.searchParams.get("grouped") === "true") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(groupModelsByTier(filtered), null, 2));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ models: filtered }, null, 2));
    } catch (err: any) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: `Failed to fetch cloud tags from Ollama (${OLLAMA_HOST}): ${err.message}`,
        })
      );
    }
  }

  // 10. Running Cloud Models endpoint (/api/ps-cloud)
  if (pathname === "/api/ps-cloud" || pathname === "/ps-cloud") {
    try {
      const rawRunning = await fetchOllamaPs();
      const cloudRunning = rawRunning.filter(isCloudModel);

      const enrichedRunning = await Promise.all(
        cloudRunning.map(async (m) => {
          const modelName = m.name || m.model;
          const usage = modelName ? await fetchModelUsage(modelName) : 1;
          return {
            ...m,
            usage,
          };
        })
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ models: enrichedRunning }, null, 2));
    } catch (err: any) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: `Failed to fetch running processes from Ollama (${OLLAMA_HOST}): ${err.message}`,
        })
      );
    }
  }

  // 11. Grouped Cloud Show endpoint (/api/show-cloud/grouped)
  if (
    pathname === "/api/show-cloud/grouped" ||
    pathname === "/show-cloud/grouped"
  ) {
    return handleShowCloudAll(req, res, parsedUrl, true);
  }

  // 12. Handle /api/show-cloud (and /show-cloud)
  if (pathname === "/api/show-cloud" || pathname === "/show-cloud") {
    const includeBenchmarks = parsedUrl.searchParams.get("benchmarks") === "true";

    if (req.method === "GET") {
      const model = parsedUrl.searchParams.get("model");
      const isGrouped = parsedUrl.searchParams.get("grouped") === "true";
      if (!model) {
        return handleShowCloudAll(req, res, parsedUrl, isGrouped, includeBenchmarks);
      }
      return handleShowCloud(req, res, { model, verbose: true, benchmarks: includeBenchmarks });
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          await handleShowCloud(req, res, payload);
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Invalid JSON: ${err.message}` }));
        }
      });
      return;
    }
  }

  // 13. Forward any other Ollama API request transparently (e.g. /api/show, /api/tags, /api/version, /api/generate)
  try {
    const targetUrl = `${OLLAMA_HOST}${req.url}`;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v && k.toLowerCase() !== "host") {
        headers[k] = Array.isArray(v) ? v.join(", ") : v;
      }
    }

    let requestBody: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      requestBody = await new Promise((resolve) => {
        let b = "";
        req.on("data", (c) => (b += c));
        req.on("end", () => resolve(b));
      });
    }

    const proxyRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: requestBody,
    });

    res.writeHead(proxyRes.status, {
      "Content-Type": proxyRes.headers.get("Content-Type") || "application/json",
    });
    const proxyData = await proxyRes.text();
    res.end(proxyData);
  } catch (err: any) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `Failed to proxy to Ollama (${OLLAMA_HOST}): ${err.message}`,
      })
    );
  }
});

async function handleShowCloud(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  payload: { model?: string; verbose?: boolean; benchmarks?: boolean; [key: string]: any }
) {
  const modelName = payload.model;
  if (!modelName) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "missing model field" }));
  }

  try {
    const enriched = await getEnrichedModelData(
      modelName,
      payload.verbose ?? true,
      payload.benchmarks ?? false
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(enriched, null, 2));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleShowCloudAll(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl: URL,
  grouped = false,
  includeBenchmarks = false
) {
  try {
    const rawModels = await fetchOllamaTags();
    const cloudModels = rawModels.filter(isCloudModel);

    const enrichedModels = await Promise.all(
      cloudModels.map(async (m) => {
        const modelName = m.name || m.model;
        if (!modelName) return m;
        try {
          const enriched = await getEnrichedModelData(
            modelName,
            true,
            includeBenchmarks
          );
          return {
            ...m,
            ...enriched,
          };
        } catch (err: any) {
          return {
            ...m,
            error: err.message,
            usage: 1,
          };
        }
      })
    );

    const filtered = applyFiltersAndSort(enrichedModels, parsedUrl.searchParams);

    if (grouped) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(groupModelsByTier(filtered), null, 2));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ models: filtered }, null, 2));
  } catch (err: any) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `Failed to fetch models from Ollama (${OLLAMA_HOST}): ${err.message}`,
      })
    );
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Ollama Cloud API is running at http://localhost:${PORT}`);
  console.log(`📚 Interactive Docs (Scalar): http://localhost:${PORT}/docs`);
  console.log(`📑 OpenAPI Specification: http://localhost:${PORT}/openapi.json`);
  console.log(`🎯 Smart Recommendation: GET http://localhost:${PORT}/api/recommend?task=coding&max_usage=2`);
  console.log(`🏆 Benchmarks Leaderboard: GET http://localhost:${PORT}/api/leaderboard`);
  console.log(`⚖️ Model Comparison: GET http://localhost:${PORT}/api/compare?models=glm-5.3-flash:cloud,glm-5.3:cloud`);
  console.log(`📊 Catalog Overview: GET http://localhost:${PORT}/api/overview`);
  console.log(`👉 Show all cloud models: GET http://localhost:${PORT}/api/show-cloud`);
  console.log(`🔗 Upstream Ollama target: ${OLLAMA_HOST}\n`);
});
