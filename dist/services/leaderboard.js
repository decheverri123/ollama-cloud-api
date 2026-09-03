import { extractModelScore, getKnownModelTier } from "../utils/model.js";
export function computeLeaderboard(benchmarkEntries, usageMap) {
    const categoryModelScores = {};
    for (const entry of benchmarkEntries) {
        const cloudTag = entry.model;
        const rawName = cloudTag.replace(/:cloud$/, "");
        const rows = entry.data.rows || [];
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
    const leaderboards = {};
    for (const [category, modelsObj] of Object.entries(categoryModelScores)) {
        const ranked = Object.entries(modelsObj)
            .map(([cloudTag, score]) => {
            const avg = Math.round((score.total / score.count) * 10) / 10;
            const rawName = cloudTag.replace(/:cloud$/, "");
            const usage = usageMap.get(rawName) ?? getKnownModelTier(rawName)?.usage ?? 2;
            return {
                rank: 0,
                model: cloudTag,
                source_model: cloudTag,
                average_score: avg,
                benchmarks_evaluated: score.count,
                usage_tier: usage,
                scores: score.benchmarks,
            };
        })
            .sort((a, b) => b.average_score - a.average_score);
        ranked.forEach((entry, index) => {
            entry.rank = index + 1;
        });
        if (ranked.length > 0) {
            leaderboards[category] = ranked;
        }
    }
    return leaderboards;
}
