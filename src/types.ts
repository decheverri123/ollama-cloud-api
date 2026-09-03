export interface ModelPricing {
  input: number;
  output: number;
  cached?: number;
}

export interface UsageCacheEntry {
  usage: number;
  pricing?: ModelPricing;
  cloud_tag?: string;
  timestamp: number;
}

export interface BenchmarkCacheEntry {
  data: ParsedBenchmarkTable | Record<string, unknown> | null;
  timestamp: number;
}

export interface LiveCloudModelInfo {
  name: string;
  cloud_tag: string;
  description: string;
  pull_command: string;
  ollama_url?: string;
}

export interface RecommendOptions {
  task?: string;
  maxUsage?: number;
  capabilities?: string[];
  minContext?: number;
  onlyInstalled?: boolean;
}

export interface RecommendationCandidate {
  model: string;
  installed: boolean;
  pull_command?: string;
  ollama_url?: string;
  usage: number;
  capabilities: string[];
  score: number;
  reason: string;
}

export interface RecommendationResult {
  task: string;
  max_usage: number;
  recommendation: string | null;
  ollama_url?: string;
  installed: boolean;
  pull_command?: string;
  usage_tier?: number;
  score?: number;
  reason?: string;
  capabilities?: string[];
  alternatives?: Array<Record<string, unknown>> | RecommendationCandidate[];
  message?: string;
}

export interface BenchmarkRow {
  benchmark: string;
  category: string;
  scores: Record<string, number | string | null>;
}

export interface ParsedBenchmarkTable {
  models: string[];
  benchmarks_count: number;
  categories: string[];
  rows: BenchmarkRow[];
}

export interface OllamaModelInfo {
  name: string;
  model?: string;
  size?: number;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
    context_length?: number;
    [key: string]: unknown;
  };
  capabilities?: string[];
  model_info?: Record<string, unknown>;
  remote_host?: string;
  remote_model?: string;
  [key: string]: unknown;
}

export interface ShowCloudRequest {
  model?: string;
  verbose?: boolean;
  benchmarks?: boolean;
}

export interface FilterableModel {
  name?: string;
  model?: string;
  ollama_url?: string;
  installed?: boolean;
  usage?: number;
  usage_label?: string;
  pricing?: ModelPricing;
  provider?: string;
  family?: string;
  profile?: string;
  context_length?: number;
  size?: number;
  capabilities?: string[];
  pull_command?: string;
  benchmarks?: ParsedBenchmarkTable;
  [key: string]: unknown;
}

export interface EnrichedModelData {
  name?: string;
  model?: string;
  ollama_url?: string;
  installed?: boolean;
  usage?: number;
  usage_label?: string;
  pricing?: ModelPricing;
  provider?: string;
  family?: string;
  profile?: string;
  context_length?: number;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
    context_length?: number;
    [key: string]: unknown;
  };
  capabilities?: string[];
  model_info?: Record<string, unknown>;
  benchmarks?: ParsedBenchmarkTable;
  [key: string]: unknown;
}
