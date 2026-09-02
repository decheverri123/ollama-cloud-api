import {
  CACHE_TTL_MS,
  usageCache,
  benchmarkCache,
  liveCatalogCache,
  setLiveCatalogCache,
} from "../config.js";
import { KNOWN_MODEL_BENCHMARKS } from "../benchmarks-data.js";
import type { LiveCloudModelInfo, ParsedBenchmarkTable } from "../types.js";
import {
  decodeHtmlEntities,
  parsePricingFromHtml,
  parseUsageLevel,
  parseUsageMeterFromHtml,
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

export async function fetchModelUsage(modelName: string): Promise<number> {
  const cached = usageCache.get(modelName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.usage;
  }

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
            // ignore
          }
        }
      }

      if (pricing) {
        const usage = calculateTierFromPricing(pricing.input, pricing.output);
        usageCache.set(modelName, { usage, pricing, timestamp: Date.now() });
        return usage;
      }

      const usageMatch = html.match(
        /Usage<\/div>\s*<div[^>]*>[\s\S]*?<span[^>]*class="[^"]*min-w-0 break-words[^"]*"[^>]*>([^<]+)<\/span>/i
      );

      if (usageMatch && usageMatch[1]) {
        const usage = parseUsageLevel(usageMatch[1]);
        usageCache.set(modelName, { usage, timestamp: Date.now() });
        return usage;
      }

      const meterUsage = parseUsageMeterFromHtml(html);
      if (meterUsage !== null) {
        usageCache.set(modelName, { usage: meterUsage, timestamp: Date.now() });
        return meterUsage;
      }
    } catch {
      // try next URL
    }
  }

  usageCache.set(modelName, { usage: 1, timestamp: Date.now() });
  return 1;
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
      // try next URL
    }
  }

  benchmarkCache.set(modelName, { data: null, timestamp: Date.now() });
  return null;
}
