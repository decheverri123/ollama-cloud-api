#!/usr/bin/env node
import http from "http";
import { URL } from "url";
import { KNOWN_MODEL_BENCHMARKS } from "./benchmarks-data.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const PORT = parseInt(process.env.PORT || "11435", 10);

// In-memory cache for usage data (TTL: 24 hours)
export interface ModelPricing {
  input: number;
  output: number;
  cached?: number;
}

export interface UsageCacheEntry {
  usage: number;
  pricing?: ModelPricing;
  timestamp: number;
}

/**
 * Pre-cached model usage tiers (1-4) and token pricing ($/1M tokens)
 * for all known Ollama Cloud models.
 */
export const KNOWN_MODEL_TIERS: Record<
  string,
  { usage: number; pricing: ModelPricing }
> = {
  "nemotron-3-nano": { usage: 1, pricing: { input: 0.06, output: 0.24, cached: 0.06 } },
  "gpt-oss": { usage: 1, pricing: { input: 0.07, output: 0.30, cached: 0.035 } },
  "gpt-oss:120b": { usage: 1, pricing: { input: 0.07, output: 0.30, cached: 0.035 } },
  "gpt-oss:120b-cloud": { usage: 1, pricing: { input: 0.07, output: 0.30, cached: 0.035 } },
  "nemotron-3-super": { usage: 1, pricing: { input: 0.015, output: 0.60, cached: 0.015 } },
  "gemma4": { usage: 1, pricing: { input: 0.14, output: 0.40, cached: 0.05 } },
  "gemma4:31b": { usage: 1, pricing: { input: 0.14, output: 0.40, cached: 0.05 } },
  "gemma4:31b-cloud": { usage: 1, pricing: { input: 0.14, output: 0.40, cached: 0.05 } },
  "glm-5.3-flash": { usage: 1, pricing: { input: 0.15, output: 0.50, cached: 0.03 } },
  "minimax-m2.7": { usage: 2, pricing: { input: 0.30, output: 1.20, cached: 0.06 } },
  "deepseek-v4-flash": { usage: 2, pricing: { input: 0.44, output: 1.32, cached: 0.014 } },
  "mistral-large-3": { usage: 2, pricing: { input: 0.50, output: 1.50, cached: 0.50 } },
  "minimax-m3": { usage: 2, pricing: { input: 0.60, output: 2.40, cached: 0.12 } },
  "nemotron-3-ultra": { usage: 2, pricing: { input: 0.10, output: 3.00, cached: 0.10 } },
  "qwen3.5": { usage: 3, pricing: { input: 0.60, output: 3.60, cached: 0.60 } },
  "qwen3.5:397b": { usage: 3, pricing: { input: 0.60, output: 3.60, cached: 0.60 } },
  "glm-5.1": { usage: 3, pricing: { input: 1.00, output: 3.20, cached: 0.20 } },
  "deepseek-v4-pro": { usage: 3, pricing: { input: 1.32, output: 3.96, cached: 0.044 } },
  "kimi-k2.7-code": { usage: 3, pricing: { input: 0.95, output: 4.00, cached: 0.19 } },
  "kimi-k2.6": { usage: 3, pricing: { input: 0.95, output: 4.00, cached: 0.16 } },
  "glm-5.2": { usage: 3, pricing: { input: 1.40, output: 4.40, cached: 0.26 } },
  "glm-5.3": { usage: 3, pricing: { input: 1.40, output: 4.40, cached: 0.26 } },
  "kimi-k3": { usage: 4, pricing: { input: 3.00, output: 15.00, cached: 0.30 } },
};

export const usageCache = new Map<string, UsageCacheEntry>();

// Seed usage cache with known tiers
for (const [key, val] of Object.entries(KNOWN_MODEL_TIERS)) {
  usageCache.set(key, {
    usage: val.usage,
    pricing: val.pricing,
    timestamp: Date.now(),
  });
}

// In-memory cache for benchmarks data (TTL: 24 hours)
export interface BenchmarkCacheEntry {
  data: Record<string, any> | null;
  timestamp: number;
}
export const benchmarkCache = new Map<string, BenchmarkCacheEntry>();

// Seed benchmark cache with known benchmarks
for (const [model, data] of Object.entries(KNOWN_MODEL_BENCHMARKS)) {
  benchmarkCache.set(model, { data, timestamp: Date.now() });
  benchmarkCache.set(`${model}:cloud`, { data, timestamp: Date.now() });
}

// In-memory cache for live cloud search catalog
export interface LiveCloudModelInfo {
  name: string;
  cloud_tag: string;
  description: string;
  pull_command: string;
}
let liveCatalogCache: { models: LiveCloudModelInfo[]; timestamp: number } | null = null;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Calculates numeric tier (1 - 4) from token costs per 1M tokens.
 */
export function calculateTierFromPricing(inputCost: number, outputCost: number): number {
  if (inputCost > 2.0 || outputCost > 5.0) return 4; // Extra High
  if (inputCost >= 0.8 || outputCost >= 3.2) return 3; // High
  if (inputCost >= 0.25 || outputCost >= 1.0) return 2; // Medium
  return 1; // Low
}

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
 * Resolves Ollama model benchmarks. Checks pre-cached static benchmarks first,
 * then falls back to live scraping from ollama.com.
 */
export async function fetchModelBenchmarks(
  modelName: string
): Promise<Record<string, any> | null> {
  const cached = benchmarkCache.get(modelName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const cleanName = modelName.toLowerCase().trim().replace(/:cloud$/, "");
  if (KNOWN_MODEL_BENCHMARKS[cleanName]) {
    const data = KNOWN_MODEL_BENCHMARKS[cleanName];
    benchmarkCache.set(modelName, { data, timestamp: Date.now() });
    return data;
  }
  const base = cleanName.split(":")[0];
  if (KNOWN_MODEL_BENCHMARKS[base]) {
    const data = KNOWN_MODEL_BENCHMARKS[base];
    benchmarkCache.set(modelName, { data, timestamp: Date.now() });
    return data;
  }

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
 * Helper to match known model tiers from cache or static map.
 */
export function getKnownModelTier(
  modelName: string
): { usage: number; pricing: ModelPricing } | null {
  const norm = modelName.toLowerCase().trim().replace(/:cloud$/, "");
  if (KNOWN_MODEL_TIERS[norm]) {
    return KNOWN_MODEL_TIERS[norm];
  }
  const base = norm.split(":")[0];
  if (KNOWN_MODEL_TIERS[base]) {
    return KNOWN_MODEL_TIERS[base];
  }
  return null;
}

/**
 * Extracts token pricing ($ / 1M tokens) from Ollama model page HTML.
 */
export function parsePricingFromHtml(html: string): ModelPricing | null {
  const inputMatch = html.match(
    /Cost[\s\S]*?\$([0-9\.]+)\s*<\/div>\s*<div[^>]*>input/i
  );
  const outputMatch = html.match(/([0-9\.]+)\s*<\/div>\s*<div[^>]*>output/i);
  const cachedMatch = html.match(/([0-9\.]+)\s*<\/div>\s*<div[^>]*>cached/i);

  if (inputMatch && outputMatch) {
    const input = parseFloat(inputMatch[1]);
    const output = parseFloat(outputMatch[1]);
    const cached = cachedMatch ? parseFloat(cachedMatch[1]) : undefined;
    if (!isNaN(input) && !isNaN(output)) {
      return { input, output, cached };
    }
  }
  return null;
}

/**
 * Resolves Ollama's model usage level into a numeric tier (1 - 4).
 * Checks the pre-cached static tier catalog first, then falls back
 * to scraping live token pricing or legacy usage badges from ollama.com.
 */
export async function fetchModelUsage(modelName: string): Promise<number> {
  const cached = usageCache.get(modelName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.usage;
  }

  // Check known pre-cached static tiers
  const known = getKnownModelTier(modelName);
  if (known) {
    usageCache.set(modelName, {
      usage: known.usage,
      pricing: known.pricing,
      timestamp: Date.now(),
    });
    return known.usage;
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

      // 1. Check for token pricing (Cost / 1M tokens)
      let pricing = parsePricingFromHtml(html);
      if (!pricing) {
        // If not found on root page, check if page links to a specific cloud tag page
        const tagMatch = html.match(/\/library\/([^"]+cloud[^"]*)/i);
        if (tagMatch) {
          try {
            const tagRes = await fetch(`https://ollama.com/library/${tagMatch[1]}`, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              },
            });
            if (tagRes.ok) {
              const tagHtml = await tagRes.text();
              pricing = parsePricingFromHtml(tagHtml);
            }
          } catch {
            // Ignore tag fetch error
          }
        }
      }

      if (pricing) {
        const usage = calculateTierFromPricing(pricing.input, pricing.output);
        usageCache.set(modelName, { usage, pricing, timestamp: Date.now() });
        return usage;
      }

      // 2. Fallback: Extract legacy Usage section text if present
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

  // Default fallback
  usageCache.set(modelName, { usage: 1, timestamp: Date.now() });
  return 1;
}

/**
 * Scrapes the live Ollama Cloud models catalog from https://ollama.com/search?c=cloud
 */
export async function fetchLiveCloudCatalog(): Promise<LiveCloudModelInfo[]> {
  if (liveCatalogCache && Date.now() - liveCatalogCache.timestamp < CACHE_TTL_MS) {
    return liveCatalogCache.models;
  }

  try {
    const res = await fetch("https://ollama.com/search?c=cloud", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      throw new Error(`Ollama search returned HTTP ${res.status}`);
    }

    const html = await res.text();
    const matches = Array.from(
      html.matchAll(/<a[^>]*href="\/library\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
    );

    const models: LiveCloudModelInfo[] = [];
    const seen = new Set<string>();

    for (const m of matches) {
      const slug = m[1].trim();
      if (seen.has(slug)) continue;
      seen.add(slug);

      const cardHtml = m[2];
      const descMatch = cardHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const desc = descMatch
        ? decodeHtmlEntities(descMatch[1].replace(/<[^>]*>/g, ""))
        : "";

      models.push({
        name: slug,
        cloud_tag: `${slug}:cloud`,
        description: desc,
        pull_command: `ollama pull ${slug}:cloud`,
      });
    }

    if (models.length > 0) {
      liveCatalogCache = { models, timestamp: Date.now() };
      return models;
    }
  } catch (err) {
    if (liveCatalogCache) return liveCatalogCache.models;
  }

  return [];
}

/**
 * Matches a cloud model slug against local installed models list.
 */
export function findLocalInstalledModel(
  cloudSlug: string,
  localModels: Array<Record<string, any>>
): Record<string, any> | null {
  const normSlug = cloudSlug.toLowerCase();
  for (const m of localModels) {
    const modName = (m.name || m.model || "").toLowerCase();
    if (
      modName === normSlug ||
      modName === `${normSlug}:cloud` ||
      modName.startsWith(`${normSlug}:`)
    ) {
      return m;
    }
  }
  return null;
}

/**
 * Fetch raw tags from Ollama API
 */
async function fetchOllamaTags(): Promise<Array<Record<string, any>>> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as { models?: Array<Record<string, any>> };
    return data.models || [];
  } catch {
    return [];
  }
}

/**
 * Fetch raw ps (running models) from Ollama API
 */
async function fetchOllamaPs(): Promise<Array<Record<string, any>>> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/ps`);
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as { models?: Array<Record<string, any>> };
    return data.models || [];
  } catch {
    return [];
  }
}

async function getEnrichedModelData(
  modelName: string,
  verbose = true,
  includeBenchmarks = false
) {
  // 1. Fetch from local Ollama instance (if installed)
  const ollamaPromise = fetch(`${OLLAMA_HOST}/api/show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName, verbose }),
  })
    .then(async (r) => {
      if (!r.ok) return null;
      return r.json();
    })
    .catch(() => null);

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
  ])) as [Record<string, any> | null, number, Record<string, any> | null];

  const res: Record<string, any> = {
    ...(modelDetails || {}),
    usage: usage || 1,
    installed: modelDetails !== null,
  };

  if (includeBenchmarks) {
    res.benchmarks = benchmarks;
  }

  return res;
}

/**
 * Applies filters (usage, max_usage, min_usage, capability, installed) and sorting to a list of models.
 */
function applyFiltersAndSort(
  models: Array<Record<string, any>>,
  searchParams: URLSearchParams
): Array<Record<string, any>> {
  let result = [...models];

  // Filter: installed e.g. ?installed=true or ?installed=false
  const installedFilter = searchParams.get("installed");
  if (installedFilter === "true") {
    result = result.filter((m) => m.installed === true);
  } else if (installedFilter === "false") {
    result = result.filter((m) => m.installed === false);
  }

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

  const host =
    (req.headers["x-forwarded-host"] as string) ||
    req.headers.host ||
    `localhost:${PORT}`;
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  // 1. OpenAPI & Scalar Documentation
  if (pathname === "/openapi.json") {
    const spec = {
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
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(spec, null, 2));
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
          docs_url: `${baseUrl}/docs`,
          openapi_url: `${baseUrl}/openapi.json`,
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
      const [rawLocalModels, liveCatalog] = await Promise.all([
        fetchOllamaTags(),
        fetchLiveCloudCatalog(),
      ]);

      const localCloudModels = rawLocalModels.filter(isCloudModel);

      const usageDist: Record<string, number> = {
        "1_low": 0,
        "2_medium": 0,
        "3_high": 0,
        "4_extra_high": 0,
      };

      const capabilitiesCount: Record<string, number> = {};
      let longContextCount = 0; // 1M+
      const modelsWithBenchmarks: string[] = [];
      const uninstalledModels: string[] = [];

      await Promise.all(
        liveCatalog.map(async (catModel) => {
          const name = catModel.name;
          const u = await fetchModelUsage(name);
          const key =
            u === 1 ? "1_low" : u === 2 ? "2_medium" : u === 3 ? "3_high" : "4_extra_high";
          usageDist[key] = (usageDist[key] || 0) + 1;

          const localMatch = findLocalInstalledModel(name, localCloudModels);
          if (!localMatch) {
            uninstalledModels.push(catModel.cloud_tag);
          } else {
            if (Array.isArray(localMatch.capabilities)) {
              for (const cap of localMatch.capabilities) {
                capabilitiesCount[cap] = (capabilitiesCount[cap] || 0) + 1;
              }
            }

            const ctx =
              localMatch.model_info?.context_length ||
              localMatch.details?.context_length ||
              localMatch.model_info?.[`${localMatch.details?.family}.context_length`];
            if (ctx && ctx >= 1000000) {
              longContextCount += 1;
            }
          }

          const bench = await fetchModelBenchmarks(name);
          if (bench) {
            modelsWithBenchmarks.push(catModel.cloud_tag);
          }
        })
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify(
          {
            live_cloud_catalog_count: liveCatalog.length,
            installed_cloud_models_count: liveCatalog.length - uninstalledModels.length,
            uninstalled_cloud_models_count: uninstalledModels.length,
            uninstalled_models: uninstalledModels,
            total_local_installed_models: rawLocalModels.length,
            usage_tier_distribution: usageDist,
            capabilities_breakdown: capabilitiesCount,
            models_with_1m_context_count: longContextCount,
            models_with_benchmarks_count: modelsWithBenchmarks.length,
            models_with_benchmarks: modelsWithBenchmarks,
            cache: {
              cached_usage_entries: usageCache.size,
              cached_benchmarks_entries: benchmarkCache.size,
              live_catalog_cached: liveCatalogCache !== null,
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
      const liveCatalog = await fetchLiveCloudCatalog();

      const usageMap = new Map<string, number>();
      const benchDataList: Array<{ model: string; data: Record<string, any> }> = [];

      await Promise.all(
        liveCatalog.map(async (catModel) => {
          const name = catModel.name;
          const u = await fetchModelUsage(name);
          usageMap.set(name, u);

          const b = await fetchModelBenchmarks(name);
          if (b) {
            benchDataList.push({ model: catModel.cloud_tag, data: b });
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
            installed: enriched.installed,
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
              installed: m.installed,
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
    const onlyInstalled = parsedUrl.searchParams.get("installed") === "true";

    try {
      const [rawLocalModels, liveCatalog] = await Promise.all([
        fetchOllamaTags(),
        fetchLiveCloudCatalog(),
      ]);

      const localCloudModels = rawLocalModels.filter(isCloudModel);

      const enrichedList = await Promise.all(
        liveCatalog.map(async (catModel) => {
          const name = catModel.name;
          const localMatch = findLocalInstalledModel(name, localCloudModels);
          const u = await fetchModelUsage(name);
          const b = await fetchModelBenchmarks(name);

          return {
            name: catModel.cloud_tag,
            installed: localMatch !== null,
            installed_tag: localMatch ? localMatch.name || localMatch.model : null,
            pull_command: catModel.pull_command,
            description: catModel.description,
            usage: u,
            benchmarks: b,
            details: localMatch?.details,
            capabilities: localMatch?.capabilities || [],
            model_info: localMatch?.model_info,
          };
        })
      );

      let candidates = enrichedList.filter((m) => {
        if (onlyInstalled && !m.installed) return false;
        if (m.usage > maxUsage) return false;

        if (reqCaps.length > 0 && m.capabilities.length > 0) {
          const caps = m.capabilities.map((c: string) => String(c).toLowerCase());
          if (!reqCaps.every((c) => caps.includes(c))) return false;
        }

        const ctx =
          m.model_info?.context_length ||
          m.details?.context_length ||
          m.model_info?.[`${m.details?.family}.context_length`] ||
          0;
        if (minContext > 0 && ctx > 0 && ctx < minContext) return false;

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
        let score = 50;
        let reason = "";

        const name = m.name;
        const caps = Array.isArray(m.capabilities)
          ? m.capabilities.map((c: string) => String(c).toLowerCase())
          : [];

        // Bonus for low usage (efficiency)
        score += (4 - m.usage) * 10;
        if (m.installed) score += 5; // Preference for already installed models

        if (task === "coding") {
          const rows = m.benchmarks?.rows || [];
          const codingRows = rows.filter(
            (r: any) =>
              r.category?.toLowerCase() === "coding" ||
              r.category?.toLowerCase() === "coding agent"
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
            (r: any) =>
              r.category?.toLowerCase() === "agentic" ||
              r.category?.toLowerCase() === "general agent"
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
          installed: m.installed,
          pull_command: m.pull_command,
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
            installed: top.installed,
            pull_command: top.installed ? undefined : top.pull_command,
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

    // List benchmarks for all models in live catalog
    try {
      const liveCatalog = await fetchLiveCloudCatalog();

      const benchmarkResults = await Promise.all(
        liveCatalog.map(async (catModel) => {
          const name = catModel.name;
          const data = await fetchModelBenchmarks(name);
          if (!data) return null;
          return {
            model: catModel.cloud_tag,
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
          live_catalog_cached: liveCatalogCache !== null,
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
    for (const [key, val] of Object.entries(KNOWN_MODEL_TIERS)) {
      usageCache.set(key, {
        usage: val.usage,
        pricing: val.pricing,
        timestamp: Date.now(),
      });
    }
    benchmarkCache.clear();
    for (const [model, data] of Object.entries(KNOWN_MODEL_BENCHMARKS)) {
      benchmarkCache.set(model, { data, timestamp: Date.now() });
      benchmarkCache.set(`${model}:cloud`, { data, timestamp: Date.now() });
    }
    liveCatalogCache = null;
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        status: "ok",
        message: `Usage, benchmark, and catalog caches cleared successfully (${count} entries removed)`,
      })
    );
  }

  // 9. Lightweight Cloud Tags endpoint (/api/tags-cloud)
  if (pathname === "/api/tags-cloud" || pathname === "/tags-cloud") {
    try {
      const [rawLocalModels, liveCatalog] = await Promise.all([
        fetchOllamaTags(),
        fetchLiveCloudCatalog(),
      ]);

      const localCloudModels = rawLocalModels.filter(isCloudModel);

      const enrichedTags = await Promise.all(
        liveCatalog.map(async (catModel) => {
          const name = catModel.name;
          const localMatch = findLocalInstalledModel(name, localCloudModels);
          const usage = await fetchModelUsage(name);

          return {
            name: catModel.cloud_tag,
            model: catModel.name,
            description: catModel.description,
            installed: localMatch !== null,
            installed_tag: localMatch ? localMatch.name || localMatch.model : null,
            pull_command: catModel.pull_command,
            usage,
            details: localMatch?.details,
            size: localMatch?.size || 0,
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
          error: `Failed to fetch cloud tags: ${err.message}`,
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
            installed: true,
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
    const [rawLocalModels, liveCatalog] = await Promise.all([
      fetchOllamaTags(),
      fetchLiveCloudCatalog(),
    ]);

    const localCloudModels = rawLocalModels.filter(isCloudModel);

    const enrichedModels = await Promise.all(
      liveCatalog.map(async (catModel) => {
        const name = catModel.name;
        const localMatch = findLocalInstalledModel(name, localCloudModels);
        const isInstalled = localMatch !== null;
        const targetModelName = localMatch ? localMatch.name || localMatch.model : catModel.cloud_tag;

        try {
          const enriched = await getEnrichedModelData(
            targetModelName,
            true,
            includeBenchmarks
          );

          return {
            name: catModel.cloud_tag,
            cloud_name: catModel.name,
            description: catModel.description,
            installed_tag: localMatch ? localMatch.name || localMatch.model : null,
            pull_command: catModel.pull_command,
            ...(localMatch || {}),
            ...enriched,
            installed: isInstalled,
          };
        } catch (err: any) {
          return {
            name: catModel.cloud_tag,
            cloud_name: catModel.name,
            description: catModel.description,
            installed: isInstalled,
            installed_tag: localMatch ? localMatch.name || localMatch.model : null,
            pull_command: catModel.pull_command,
            usage: await fetchModelUsage(name),
            error: err.message,
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
        error: `Failed to fetch cloud models: ${err.message}`,
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
