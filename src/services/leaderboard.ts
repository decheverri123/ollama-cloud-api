import { extractModelScore, getKnownModelTier } from "../utils/model.js";
import type { ParsedBenchmarkTable } from "../types.js";

export function computeLeaderboard(
  benchmarkDataList: Array<{ model: string; data: ParsedBenchmarkTable }>,
  usageMap: Map<string, number>
): Record<string, Array<Record<string, unknown>>> {
  const categoryModelScores: Record<
    string,
    Record<string, { total: number; count: number; benchmarks: Record<string, number> }>
  > = {};

  for (const item of benchmarkDataList) {
    const cloudTag = item.model;
    const rawName = cloudTag.replace(/:cloud$/, "");
    const rows = item.data.rows || [];

    for (const row of rows) {
      const category = row.category || "General";
      if (!categoryModelScores[category]) {
        categoryModelScores[category] = {};
      }

      const score = extractModelScore(row.scores || {}, rawName);
      if (score !== null && typeof score === "number") {
        if (!categoryModelScores[category][cloudTag]) {
          categoryModelScores[category][cloudTag] = {
            total: 0,
            count: 0,
            benchmarks: {},
          };
        }
        categoryModelScores[category][cloudTag].total += score;
        categoryModelScores[category][cloudTag].count += 1;
        categoryModelScores[category][cloudTag].benchmarks[row.benchmark] = score;
      }
    }
  }

  const leaderboards: Record<string, Array<Record<string, unknown>>> = {};

  for (const [category, modelsObj] of Object.entries(categoryModelScores)) {
    const ranked = Object.entries(modelsObj)
      .map(([cloudTag, stat]) => {
        const avg = Math.round((stat.total / stat.count) * 10) / 10;
        const rawName = cloudTag.replace(/:cloud$/, "");
        const usage = usageMap.get(rawName) ?? getKnownModelTier(rawName)?.usage ?? 2;

        return {
          rank: 0,
          model: cloudTag,
          source_model: cloudTag,
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

    if (ranked.length > 0) {
      leaderboards[category] = ranked;
    }
  }

  return leaderboards;
}
