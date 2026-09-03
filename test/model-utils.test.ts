import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTierFromPricing,
  getUsageLabel,
  inferModelProvider,
  inferModelProfile,
  getKnownContextLength,
  getKnownParameterSize,
  getOllamaModelUrl,
  isCloudModel,
  getKnownModelTier,
  findLocalInstalledModel,
  normalizeTokens,
  extractModelScore,
  applyFiltersAndSort,
  groupModelsByTier,
} from "../src/utils/model.js";
import type { FilterableModel } from "../src/types.js";

test("calculateTierFromPricing returns correct tier thresholds", () => {
  assert.equal(calculateTierFromPricing(0.05, 0.2), 1); // Low
  assert.equal(calculateTierFromPricing(0.25, 0.5), 2); // Medium
  assert.equal(calculateTierFromPricing(0.1, 1.0), 2); // Medium
  assert.equal(calculateTierFromPricing(0.8, 2.0), 3); // High
  assert.equal(calculateTierFromPricing(0.5, 3.2), 3); // High
  assert.equal(calculateTierFromPricing(2.1, 4.0), 4); // Extra High
  assert.equal(calculateTierFromPricing(1.0, 5.5), 4); // Extra High
});

test("getUsageLabel maps tiers to descriptive labels", () => {
  assert.equal(getUsageLabel(1), "Low");
  assert.equal(getUsageLabel(2), "Medium");
  assert.equal(getUsageLabel(3), "High");
  assert.equal(getUsageLabel(4), "Extra High");
  assert.equal(getUsageLabel(99), "Low");
});

test("inferModelProvider correctly identifies model lab and family", () => {
  assert.deepEqual(inferModelProvider("glm-5.3-flash"), { provider: "Zhipu AI", family: "GLM" });
  assert.deepEqual(inferModelProvider("kimi-k3:cloud"), { provider: "Moonshot AI", family: "Kimi" });
  assert.deepEqual(inferModelProvider("deepseek-v4-pro"), { provider: "DeepSeek", family: "DeepSeek" });
  assert.deepEqual(inferModelProvider("minimax-m3"), { provider: "MiniMax", family: "MiniMax" });
  assert.deepEqual(inferModelProvider("mistral-large-3"), { provider: "Mistral AI", family: "Mistral" });
  assert.deepEqual(inferModelProvider("nemotron-3-ultra"), { provider: "Nvidia", family: "Nemotron" });
  assert.deepEqual(inferModelProvider("qwen3.5:cloud"), { provider: "Alibaba", family: "Qwen" });
  assert.deepEqual(inferModelProvider("gemma4:31b"), { provider: "Google", family: "Gemma" });
  assert.deepEqual(inferModelProvider("gpt-oss:120b"), { provider: "OpenAI", family: "GPT" });
  assert.deepEqual(inferModelProvider("llama3.3"), { provider: "Meta", family: "Llama" });
  assert.deepEqual(inferModelProvider("phi-4"), { provider: "Microsoft", family: "Phi" });
  assert.deepEqual(inferModelProvider("command-r-plus"), { provider: "Cohere", family: "Command" });
  assert.deepEqual(inferModelProvider("custom-bot"), { provider: "Community", family: "custom" });
});

test("inferModelProfile maps model names to workload profiles", () => {
  assert.equal(inferModelProfile("glm-5.3-flash"), "fast");
  assert.equal(inferModelProfile("nemotron-3-nano"), "fast");
  assert.equal(inferModelProfile("deepseek-r1:cloud"), "thinking");
  assert.equal(inferModelProfile("kimi-k2.7-code"), "thinking");
  assert.equal(inferModelProfile("deepseek-v4-pro"), "pro");
  assert.equal(inferModelProfile("nemotron-3-ultra"), "pro");
  assert.equal(inferModelProfile("mistral-large-3:675b"), "pro");
  assert.equal(inferModelProfile("custom-llm"), "general");
});

test("getKnownContextLength returns known context sizes", () => {
  assert.equal(getKnownContextLength("kimi-k3"), 1000000);
  assert.equal(getKnownContextLength("minimax-m3"), 1000000);
  assert.equal(getKnownContextLength("deepseek-v4-pro"), 1000000);
  assert.equal(getKnownContextLength("nemotron-3-ultra"), 1048576);
  assert.equal(getKnownContextLength("glm-5.3"), 131072);
  assert.equal(getKnownContextLength("unknown-model"), undefined);
});

test("getKnownParameterSize returns parameter size strings", () => {
  assert.equal(getKnownParameterSize("deepseek-v4-pro"), "1.65T");
  assert.equal(getKnownParameterSize("kimi-k3"), "2.8T");
  assert.equal(getKnownParameterSize("glm-5.3-flash"), "321B");
  assert.equal(getKnownParameterSize("nemotron-3-nano"), "30B");
  assert.equal(getKnownParameterSize("gpt-oss"), "20B");
  assert.equal(getKnownParameterSize("unknown-model"), undefined);
});

test("getOllamaModelUrl generates canonical Ollama library URLs", () => {
  assert.equal(getOllamaModelUrl("glm-5.3-flash:cloud"), "https://ollama.com/library/glm-5.3-flash");
  assert.equal(getOllamaModelUrl("kimi-k3"), "https://ollama.com/library/kimi-k3");
});

test("isCloudModel detects cloud tags and remote flags", () => {
  assert.equal(isCloudModel({ name: "glm-5.3:cloud" }), true);
  assert.equal(isCloudModel({ model: "kimi-k3:cloud" }), true);
  assert.equal(isCloudModel({ name: "llama3.2", remote_host: "https://ollama.ai" }), true);
  assert.equal(isCloudModel({ name: "llama3.2" }), false);
});

test("getKnownModelTier retrieves pre-seeded model tiers", () => {
  const glm = getKnownModelTier("glm-5.3-flash:cloud");
  assert.ok(glm);
  assert.equal(glm.usage, 2);
  assert.equal(glm.pricing.input, 0.15);
  assert.equal(glm.pricing.output, 0.5);

  const unknown = getKnownModelTier("nonexistent-model");
  assert.equal(unknown, null);
});

test("findLocalInstalledModel matches cloud slugs to local installed models", () => {
  const localList = [
    { name: "glm-5.3-flash:cloud", size: 1000 },
    { name: "llama3.2:latest", size: 2000 },
  ];
  const found = findLocalInstalledModel("glm-5.3-flash", localList);
  assert.ok(found);
  assert.equal(found.name, "glm-5.3-flash:cloud");

  const notFound = findLocalInstalledModel("kimi-k3", localList);
  assert.equal(notFound, null);
});

test("normalizeTokens cleans and splits model strings", () => {
  assert.deepEqual(normalizeTokens("deepseek-v4-flash:cloud"), ["deepseek", "v", "4", "flash"]);
});

test("extractModelScore matches scores across benchmark column variations", () => {
  const scores = {
    "GLM-5.3-Flash": 85.5,
    "DeepSeek-V4": 92.1,
  };
  assert.equal(extractModelScore(scores, "glm-5.3-flash:cloud"), 85.5);
  assert.equal(extractModelScore(scores, "deepseek-v4"), 92.1);
  assert.equal(extractModelScore(scores, "unknown-model"), null);
});

test("applyFiltersAndSort filters and sorts models correctly", () => {
  const models: FilterableModel[] = [
    {
      name: "m1",
      usage: 1,
      installed: true,
      capabilities: ["tools", "vision"],
      provider: "Moonshot AI",
      family: "Kimi",
      profile: "fast",
      size: 100,
    },
    {
      name: "m2",
      usage: 3,
      installed: false,
      capabilities: ["tools"],
      provider: "Zhipu AI",
      family: "GLM",
      profile: "pro",
      size: 500,
    },
    {
      name: "m3",
      usage: 2,
      installed: true,
      capabilities: ["vision"],
      provider: "OpenAI",
      family: "GPT",
      profile: "thinking",
      size: 200,
    },
  ];

  // Filter installed=true
  const installedOnly = applyFiltersAndSort(models, new URLSearchParams("installed=true"));
  assert.equal(installedOnly.length, 2);

  // Filter max_usage=2
  const maxTier2 = applyFiltersAndSort(models, new URLSearchParams("max_usage=2"));
  assert.equal(maxTier2.length, 2);

  // Filter capability=tools,vision
  const toolsAndVision = applyFiltersAndSort(models, new URLSearchParams("capability=tools,vision"));
  assert.equal(toolsAndVision.length, 1);
  assert.equal(toolsAndVision[0].name, "m1");

  // Sort by usage desc
  const sortedUsageDesc = applyFiltersAndSort(models, new URLSearchParams("sort=usage_desc"));
  assert.equal(sortedUsageDesc[0].name, "m2");

  // Sort by size desc
  const sortedSizeDesc = applyFiltersAndSort(models, new URLSearchParams("sort=size"));
  assert.equal(sortedSizeDesc[0].name, "m2");
});

test("groupModelsByTier buckets models by 1-4 usage tiers", () => {
  const models: FilterableModel[] = [
    { name: "m1", usage: 1 },
    { name: "m2", usage: 2 },
    { name: "m3", usage: 4 },
  ];
  const grouped = groupModelsByTier(models);
  assert.equal(grouped["1_low"].length, 1);
  assert.equal(grouped["2_medium"].length, 1);
  assert.equal(grouped["3_high"].length, 0);
  assert.equal(grouped["4_extra_high"].length, 1);
});
