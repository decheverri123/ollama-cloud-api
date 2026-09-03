import { KNOWN_MODEL_TIERS } from "../config.js";
import type { ModelPricing, OllamaModelInfo, FilterableModel } from "../types.js";

export function calculateTierFromPricing(inputCost: number, outputCost: number): number {
  if (inputCost > 2.0 || outputCost > 5.0) return 4; // Extra High
  if (inputCost >= 0.8 || outputCost >= 3.2) return 3; // High
  if (inputCost >= 0.25 || outputCost >= 1.0) return 2; // Medium
  return 1; // Low
}

export function getUsageLabel(usage: number): string {
  switch (usage) {
    case 1:
      return "Low";
    case 2:
      return "Medium";
    case 3:
      return "High";
    case 4:
      return "Extra High";
    default:
      return "Low";
  }
}

export function inferModelProvider(modelName: string): { provider: string; family: string } {
  const norm = modelName.toLowerCase();
  if (norm.startsWith("kimi")) {
    return { provider: "Moonshot AI", family: "Kimi" };
  }
  if (norm.startsWith("glm")) {
    return { provider: "Zhipu AI", family: "GLM" };
  }
  if (norm.startsWith("deepseek")) {
    return { provider: "DeepSeek", family: "DeepSeek" };
  }
  if (norm.startsWith("minimax")) {
    return { provider: "MiniMax", family: "MiniMax" };
  }
  if (norm.startsWith("mistral") || norm.startsWith("codestral")) {
    return { provider: "Mistral AI", family: "Mistral" };
  }
  if (norm.startsWith("nemotron")) {
    return { provider: "Nvidia", family: "Nemotron" };
  }
  if (norm.startsWith("qwen")) {
    return { provider: "Alibaba", family: "Qwen" };
  }
  if (norm.startsWith("gemma")) {
    return { provider: "Google", family: "Gemma" };
  }
  if (norm.startsWith("gpt-oss")) {
    return { provider: "OpenAI", family: "GPT" };
  }
  if (norm.startsWith("llama")) {
    return { provider: "Meta", family: "Llama" };
  }
  if (norm.startsWith("phi")) {
    return { provider: "Microsoft", family: "Phi" };
  }
  if (norm.startsWith("command")) {
    return { provider: "Cohere", family: "Command" };
  }
  return { provider: "Community", family: norm.split(/[-:_]/)[0] };
}

export function inferModelProfile(modelName: string): "fast" | "thinking" | "pro" | "general" {
  const norm = modelName.toLowerCase();
  if (
    norm.includes("flash") ||
    norm.includes("nano") ||
    norm.includes("mini") ||
    norm.includes("speed") ||
    norm.includes("lite") ||
    norm.includes("small")
  ) {
    return "fast";
  }
  if (
    norm.includes("think") ||
    norm.includes("reason") ||
    norm.includes("-r1") ||
    norm.includes("code") ||
    norm.includes("coder")
  ) {
    return "thinking";
  }
  if (
    norm.includes("pro") ||
    norm.includes("ultra") ||
    norm.includes("super") ||
    norm.includes("large") ||
    norm.includes("675b") ||
    norm.includes("max")
  ) {
    return "pro";
  }
  return "general";
}

export function getKnownContextLength(modelName: string): number | undefined {
  const norm = modelName.toLowerCase();
  if (norm.startsWith("kimi") || norm.startsWith("minimax")) {
    return 1000000;
  }
  if (
    norm.startsWith("nemotron-3-nano") ||
    norm.startsWith("nemotron-3-super") ||
    norm.startsWith("nemotron-3-ultra")
  ) {
    return 1048576;
  }
  if (norm.startsWith("glm-5")) {
    return 131072;
  }
  if (norm.startsWith("deepseek")) {
    return 131072;
  }
  if (norm.startsWith("mistral-large")) {
    return 131072;
  }
  if (norm.startsWith("qwen")) {
    return 131072;
  }
  if (norm.startsWith("gemma4")) {
    return 131072;
  }
  if (norm.startsWith("gpt-oss")) {
    return 131072;
  }
  return undefined;
}

export function isCloudModel(model: OllamaModelInfo): boolean {
  return Boolean(
    model.remote_host ||
      model.remote_model ||
      model.name?.includes(":cloud") ||
      model.model?.includes(":cloud")
  );
}

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

export function findLocalInstalledModel(
  cloudSlug: string,
  localModels: OllamaModelInfo[]
): OllamaModelInfo | null {
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

export function normalizeTokens(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/:cloud$/, "")
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function extractModelScore(
  scores: Record<string, number | string | null>,
  modelName: string
): number | string | null {
  if (!scores || Object.keys(scores).length === 0) return null;

  const modTokens = normalizeTokens(modelName);

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

  // Token overlap match (e.g. "V4-Flash High" for "deepseek-v4-flash")
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

export function parseCapabilities(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  return value.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
}

export function applyFiltersAndSort(
  models: FilterableModel[],
  searchParams: URLSearchParams
): FilterableModel[] {
  let result = [...models];

  const installedFilter = searchParams.get("installed");
  if (installedFilter === "true") {
    result = result.filter((m) => m.installed === true);
  } else if (installedFilter === "false") {
    result = result.filter((m) => m.installed === false);
  }

  const usageFilter = searchParams.get("usage");
  if (usageFilter) {
    const allowed = usageFilter.split(",").map((u) => parseInt(u.trim(), 10));
    result = result.filter((m) => m.usage !== undefined && allowed.includes(m.usage));
  }

  const maxUsage = searchParams.get("max_usage");
  if (maxUsage) {
    const max = parseInt(maxUsage, 10);
    if (!isNaN(max)) {
      result = result.filter((m) => m.usage !== undefined && m.usage <= max);
    }
  }

  const minUsage = searchParams.get("min_usage");
  if (minUsage) {
    const min = parseInt(minUsage, 10);
    if (!isNaN(min)) {
      result = result.filter((m) => m.usage !== undefined && m.usage >= min);
    }
  }

  const capabilityFilter = searchParams.get("capability");
  if (capabilityFilter) {
    const requiredCaps = capabilityFilter
      .split(",")
      .map((c) => c.trim().toLowerCase());
    result = result.filter((m) => {
      const caps = Array.isArray(m.capabilities)
        ? m.capabilities.map((c) => String(c).toLowerCase())
        : [];
      return requiredCaps.every((req) => caps.includes(req));
    });
  }

  const hasBenchmarksFilter = searchParams.get("has_benchmarks");
  if (hasBenchmarksFilter === "true") {
    result = result.filter((m) => {
      const b = m.benchmarks as { rows?: unknown[] } | undefined;
      return Boolean(b && Array.isArray(b.rows) && b.rows.length > 0);
    });
  } else if (hasBenchmarksFilter === "false") {
    result = result.filter((m) => {
      const b = m.benchmarks as { rows?: unknown[] } | undefined;
      return !b || !Array.isArray(b.rows) || b.rows.length === 0;
    });
  }

  const providerFilter = searchParams.get("provider");
  if (providerFilter) {
    const pLow = providerFilter.toLowerCase().trim();
    result = result.filter((m) => {
      const prov = (m.provider || "").toLowerCase();
      const fam = (m.family || "").toLowerCase();
      return prov.includes(pLow) || fam.includes(pLow);
    });
  }

  const profileFilter = searchParams.get("profile");
  if (profileFilter) {
    const profLow = profileFilter.toLowerCase().trim();
    result = result.filter((m) => (m.profile || "").toLowerCase() === profLow);
  }

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

export function groupModelsByTier(
  models: FilterableModel[]
): Record<string, FilterableModel[]> {
  const grouped: Record<string, FilterableModel[]> = {
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
    const key = tierMap[m.usage ?? 1] || "1_low";
    grouped[key].push(m);
  }

  return grouped;
}
