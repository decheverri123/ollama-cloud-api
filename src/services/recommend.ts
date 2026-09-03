import type {
  RecommendOptions,
  RecommendationResult,
  RecommendationCandidate,
  ParsedBenchmarkTable,
  OllamaModelInfo,
} from "../types.js";
import { fetchLiveCloudCatalog, fetchModelUsage, fetchModelBenchmarks } from "./scraper.js";
import { fetchOllamaTags } from "./ollama.js";
import {
  isCloudModel,
  findLocalInstalledModel,
  extractModelScore,
  getOllamaModelUrl,
} from "../utils/model.js";

interface EnrichedModel {
  name: string;
  installed: boolean;
  installed_tag: string | null | undefined;
  pull_command: string;
  description: string;
  usage: number;
  benchmarks: ParsedBenchmarkTable | null;
  details: OllamaModelInfo["details"];
  capabilities: string[];
  model_info: OllamaModelInfo["model_info"];
}

const BASE_SCORE = 50;
const INSTALLED_BONUS = 5;
const TIER_DOWNGRADE_PER_LEVEL = 10;
const TASK_MATCH_BONUS = { tools: 15, thinking: 10, vision: 40 } as const;
const TASK_MATCH_PENALTY = { vision_missing: -100 } as const;
const AGENTIC_BONUS = { tools: 25, thinking: 15 } as const;
const FAST_TIER_DOWNGRADE_PER_LEVEL = 30;
const GENERAL_TIER_DOWNGRADE_PER_LEVEL = 15;

interface ScorerContext {
  candidate: EnrichedModel;
  caps: string[];
}

type Scorer = (ctx: ScorerContext) => { score: number; reason: string } | null;

function scoreCategory(
  benchmarks: ParsedBenchmarkTable | null,
  rawName: string,
  categories: string[]
): { avg: number; count: number } | null {
  if (!benchmarks) return null;
  const rows = benchmarks.rows.filter((r) =>
    categories.includes(r.category?.toLowerCase() ?? "")
  );
  if (rows.length === 0) return null;
  let total = 0;
  let count = 0;
  for (const r of rows) {
    const val = extractModelScore(r.scores || {}, rawName);
    if (typeof val === "number") {
      total += val;
      count += 1;
    }
  }
  return count > 0 ? { avg: total / count, count } : null;
}

const TASK_SCORERS: Record<string, Scorer> = {
  coding({ candidate, caps }) {
    const scored = scoreCategory(candidate.benchmarks, candidate.name, ["coding", "coding agent"]);
    let bonus = 0;
    let reason = "";
    if (scored) {
      const { avg, count } = scored;
      bonus += avg;
      reason = `High coding benchmark average of ${Math.round(avg * 10) / 10}% on ${count} coding benchmarks`;
    } else {
      reason = `Supports coding with capabilities [${caps.join(", ")}] at tier ${candidate.usage}`;
    }
    if (caps.includes("tools")) bonus += TASK_MATCH_BONUS.tools;
    if (caps.includes("thinking")) bonus += TASK_MATCH_BONUS.thinking;
    return { score: bonus, reason };
  },

  agentic({ candidate, caps }) {
    const scored = scoreCategory(candidate.benchmarks, candidate.name, ["agentic", "general agent"]);
    let bonus = 0;
    let reason = "";
    if (scored) {
      const { avg } = scored;
      bonus += avg;
      reason = `Top agentic benchmark average of ${Math.round(avg * 10) / 10}%`;
    } else {
      reason = `Agent-ready model with tool calling at tier ${candidate.usage}`;
    }
    if (caps.includes("tools")) bonus += AGENTIC_BONUS.tools;
    if (caps.includes("thinking")) bonus += AGENTIC_BONUS.thinking;
    return { score: bonus, reason };
  },

  vision({ candidate, caps }) {
    if (!caps.includes("vision")) {
      return {
        score: TASK_MATCH_PENALTY.vision_missing,
        reason: `Missing vision capability at tier ${candidate.usage}`,
      };
    }
    return {
      score: TASK_MATCH_BONUS.vision,
      reason: `Multimodal vision model at usage tier ${candidate.usage}`,
    };
  },

  fast({ candidate }) {
    return {
      score: (4 - candidate.usage) * FAST_TIER_DOWNGRADE_PER_LEVEL,
      reason: `Lowest usage tier (${candidate.usage}) for high throughput and quota preservation`,
    };
  },

  cheap({ candidate }) {
    return {
      score: (4 - candidate.usage) * FAST_TIER_DOWNGRADE_PER_LEVEL,
      reason: `Lowest usage tier (${candidate.usage}) for high throughput and quota preservation`,
    };
  },
};

const DEFAULT_SCORER: Scorer = ({ candidate }) => ({
  score: (4 - candidate.usage) * GENERAL_TIER_DOWNGRADE_PER_LEVEL,
  reason: `Balanced general-purpose cloud model at tier ${candidate.usage}`,
});

export async function recommendModel(options: RecommendOptions): Promise<RecommendationResult> {
  const task = (options.task || "coding").toLowerCase();
  const maxUsage = options.maxUsage ?? 4;
  const reqCaps = (options.capabilities || []).map((c) => c.trim().toLowerCase());
  const minContext = options.minContext || 0;
  const onlyInstalled = options.onlyInstalled || false;

  const [rawLocalModels, liveCatalog] = await Promise.all([
    fetchOllamaTags(),
    fetchLiveCloudCatalog(),
  ]);

  const localCloudModels = rawLocalModels.filter(isCloudModel);

  const enrichedModels: EnrichedModel[] = await Promise.all(
    liveCatalog.map(async (catModel) => {
      const name = catModel.name;
      const localMatch = findLocalInstalledModel(name, localCloudModels);
      const usage = await fetchModelUsage(name);
      const benchmarks = await fetchModelBenchmarks(name);

      const installed_tag = localMatch?.name || localMatch?.model || null;

      return {
        name: catModel.cloud_tag,
        installed: localMatch !== null,
        installed_tag,
        pull_command: catModel.pull_command,
        description: catModel.description,
        usage: usage,
        benchmarks: benchmarks,
        details: localMatch?.details,
        capabilities: localMatch?.capabilities || [],
        model_info: localMatch?.model_info,
      };
    })
  );

  const candidates = enrichedModels.filter((m) => {
    if (onlyInstalled && !m.installed) return false;
    if (m.usage > maxUsage) return false;

    if (reqCaps.length > 0 && m.capabilities.length > 0) {
      const caps = m.capabilities.map((c: string) => String(c).toLowerCase());
      if (!reqCaps.every((c) => caps.includes(c))) return false;
    }

    const ctx =
      (m.model_info?.context_length as number | undefined) ||
      (m.details?.context_length as number | undefined) ||
      ((m.model_info?.[`${m.details?.family}.context_length`] as number | undefined) ?? 0);
    if (minContext > 0 && ctx > 0 && ctx < minContext) return false;

    return true;
  });

  if (candidates.length === 0) {
    return {
      task,
      max_usage: maxUsage,
      recommendation: null,
      installed: false,
      message: "No cloud models match the requested constraints.",
    };
  }

  const scorer = TASK_SCORERS[task] ?? DEFAULT_SCORER;
  const scoredCandidates: RecommendationCandidate[] = candidates.map((m) => {
    const caps = Array.isArray(m.capabilities)
      ? m.capabilities.map((c: string) => String(c).toLowerCase())
      : [];

    let score = BASE_SCORE + (4 - m.usage) * TIER_DOWNGRADE_PER_LEVEL;
    if (m.installed) score += INSTALLED_BONUS;

    const taskResult = scorer({ candidate: m, caps });
    if (taskResult) {
      score += taskResult.score;
    }

    return {
      model: m.name,
      installed: m.installed,
      pull_command: m.pull_command,
      ollama_url: getOllamaModelUrl(m.name),
      usage: m.usage,
      capabilities: caps,
      score: Math.round(score * 10) / 10,
      reason: taskResult?.reason ?? "",
    };
  });

  scoredCandidates.sort((a, b) => b.score - a.score);
  const top = scoredCandidates[0];
  const alternatives = scoredCandidates.slice(1, 4);

  return {
    task,
    max_usage: maxUsage,
    recommendation: top.model,
    ollama_url: getOllamaModelUrl(top.model),
    installed: top.installed,
    pull_command: top.installed ? undefined : top.pull_command,
    usage_tier: top.usage,
    score: top.score,
    reason: top.reason,
    capabilities: top.capabilities,
    alternatives,
  };
}
