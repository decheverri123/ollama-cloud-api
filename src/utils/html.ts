import type { ModelPricing, ParsedBenchmarkTable } from "../types.js";

export function decodeHtmlEntities(str: string): string {
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
 * Extracts the usage tier from Ollama's 4-bar usage meter on the
 * per-model /tags page. Each bar is a span like
 * `<span class="block h-1 w-4 rounded-full bg-neutral-800"></span>`;
 * dark bars (bg-neutral-800) indicate the tier (1 - 4).
 */
export function parseUsageMeterFromHtml(html: string): number | null {
  const meterMatch = html.match(
    /<p[^>]*class="[^"]*col-span-2[^"]*flex items-center gap-0\.5[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  );
  if (!meterMatch) return null;
  const bars = meterMatch[1].match(/rounded-full bg-neutral-(\d+)/g);
  if (!bars) return null;
  const dark = bars.filter((b) => b.includes("bg-neutral-800")).length;
  return dark < 1 ? null : Math.min(dark, 4);
}

export function parseMarkdownTable(tableText: string): ParsedBenchmarkTable | null {
  const lines = tableText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && l.endsWith("|"));

  if (lines.length < 2) return null;

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

    // category header row (e.g. | **Coding** | | | ...)
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

export function parseAllHtmlTables(displayHtml: string): ParsedBenchmarkTable | null {
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

    const trMatches = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    let currentCategory = "General";

    for (let i = 0; i < trMatches.length; i++) {
      const tr = trMatches[i][1];

      if (tr.includes("<th") && i === 0) continue;

      const tdMatches = Array.from(tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi));
      if (tdMatches.length === 0) continue;

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
