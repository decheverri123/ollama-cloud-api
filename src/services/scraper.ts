import {
  CACHE_TTL_MS,
  usageCache,
  benchmarkCache,
  liveCatalogCache,
  setLiveCatalogCache,
} from "../config.js";
import { KNOWN_MODEL_BENCHMARKS } from "../benchmarks-data.js";
import type { LiveCloudModelInfo, ParsedBenchmarkTable, ModelPricing } from "../types.js";
import {
  decodeHtmlEntities,
  parsePricingFromHtml,
  parseUsageLevel,
  parseMarkdownTable,
  parseAllHtmlTables,
} from "../utils/html.js";
import {
  calculateTierFromPricing,
  getKnownModelTier,
} from "../utils/model.js";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function fetchModelUsageDetails(
  modelName: string
): Promise<{ usage: number; pricing?: ModelPricing }> {
  const cached = usageCache.get(modelName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { usage: cached.usage, pricing: cached.pricing };
  }

  const known = getKnownModelTier(modelName);
  if (known) {
    usageCache.set(modelName, {
      usage: known.usage,
      pricing: known.pricing,
      timestamp: Date.now(),
    });
    return { usage: known.usage, pricing: known.pricing };
  }

  const cleanName = modelName.replace(/:cloud$/, "");
  const urls = [
    `https://ollama.com/library/${modelName}`,
    `https://ollama.com/library/${cleanName}`,
    `https://ollama.com/library/${modelName}/tags`,
    `https://ollama.com/library/${cleanName}/tags`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: DEFAULT_HEADERS });
      if (!res.ok) continue;

      const html = await res.text();

      let pricing = parsePricingFromHtml(html);
      if (!pricing) {
        const tagMatch = html.match(/\/library\/([^"]+cloud[^"]*)/i);
        if (tagMatch) {
          try {
            const tagRes = await fetch(`https://ollama.com/library/${tagMatch[1]}`, {
              headers: DEFAULT_HEADERS,
            });
            if (tagRes.ok) {
              const tagHtml = await tagRes.text();
              pricing = parsePricingFromHtml(tagHtml);
            }
          } catch {
            // Tag page unavailable; fall through to next URL strategy
          }
        }
      }

      if (pricing) {
        const usage = calculateTierFromPricing(pricing.input, pricing.output);
        usageCache.set(modelName, { usage, pricing, timestamp: Date.now() });
        return { usage, pricing };
      }

      const usageMatch = html.match(
        /•\s*(Low|Medium|High|Extra High|Very High)\s+Usage\s*•/i
      );

      if (usageMatch && usageMatch[1]) {
        const usage = parseUsageLevel(usageMatch[1]);
        usageCache.set(modelName, { usage, timestamp: Date.now() });
        return { usage };
      }
    } catch {
      // URL unavailable; try next in rotation
    }
  }

  usageCache.set(modelName, { usage: 1, timestamp: Date.now() });
  return { usage: 1 };
}

export async function fetchModelUsage(modelName: string): Promise<number> {
  const details = await fetchModelUsageDetails(modelName);
  return details.usage;
}

export function getCloudTagForModel(modelName: string): string | undefined {
  const cached = usageCache.get(modelName);
  return cached?.cloud_tag;
}

export async function fetchCloudTagForModel(modelName: string): Promise<string | undefined> {
  const cached = usageCache.get(modelName);
  if (cached?.cloud_tag) return cached.cloud_tag;

  const cleanName = modelName.replace(/:cloud$/, "").replace(/:.+-cloud$/, "");
  const url = `https://ollama.com/library/${cleanName}/tags`;

  try {
    const res = await fetch(url, { headers: DEFAULT_HEADERS });
    if (!res.ok) return undefined;

    const html = await res.text();

    const cloudTagMatch = html.match(
      /<a[^>]*href="\/library\/([^"]+cloud[^"]*)"[^>]*>([^<]*)<\/a>/i
    );

    if (cloudTagMatch && cloudTagMatch[2]) {
      const tag = cloudTagMatch[2].trim();
      const existing = usageCache.get(modelName) || { usage: 1, timestamp: Date.now() };
      usageCache.set(modelName, { ...existing, cloud_tag: tag });
      return tag;
    }
  } catch {
    // Cloud tag unavailable; caller falls back to derived tag
  }

  return undefined;
}

export async function fetchLiveCloudCatalog(): Promise<LiveCloudModelInfo[]> {
  if (liveCatalogCache && Date.now() - liveCatalogCache.timestamp < CACHE_TTL_MS) {
    return liveCatalogCache.models;
  }

  try {
    const res = await fetch("https://ollama.com/search?c=cloud", {
      headers: DEFAULT_HEADERS,
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
      setLiveCatalogCache({ models, timestamp: Date.now() });

      for (const model of models) {
        fetchCloudTagForModel(model.name).then((cloudTag) => {
          if (cloudTag) {
            model.cloud_tag = cloudTag;
            model.pull_command = `ollama pull ${cloudTag}`;
          }
        }).catch(() => {});
      }

      return models;
    }
  } catch (err) {
    console.error("fetchLiveCloudCatalog failed:", err);
    if (liveCatalogCache) return liveCatalogCache.models;
  }

  return [];
}

export async function fetchModelBenchmarks(
  modelName: string
): Promise<ParsedBenchmarkTable | null> {
  const cached = benchmarkCache.get(modelName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return (cached.data as ParsedBenchmarkTable | null) ?? null;
  }

  const cleanName = modelName.toLowerCase().trim().replace(/:cloud$/, "");
  if (KNOWN_MODEL_BENCHMARKS[cleanName]) {
    const benchmarks = KNOWN_MODEL_BENCHMARKS[cleanName];
    benchmarkCache.set(modelName, { data: benchmarks, timestamp: Date.now() });
    return benchmarks;
  }
  const base = cleanName.split(":")[0];
  if (KNOWN_MODEL_BENCHMARKS[base]) {
    const benchmarks = KNOWN_MODEL_BENCHMARKS[base];
    benchmarkCache.set(modelName, { data: benchmarks, timestamp: Date.now() });
    return benchmarks;
  }

  const urls = [
    `https://ollama.com/library/${modelName}`,
    `https://ollama.com/library/${cleanName}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: DEFAULT_HEADERS });
      if (!res.ok) continue;

      const html = await res.text();

      const displayMatch = html.match(/id="display"[^>]*>([\s\S]*?)<\/div>/i);
      const targetHtml = displayMatch ? displayMatch[1] : html;

      const parsedHtml = parseAllHtmlTables(targetHtml);
      if (parsedHtml) {
        benchmarkCache.set(modelName, { data: parsedHtml, timestamp: Date.now() });
        return parsedHtml;
      }

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
      // URL unavailable; try next in rotation
    }
  }

  benchmarkCache.set(modelName, { data: null, timestamp: Date.now() });
  return null;
}
