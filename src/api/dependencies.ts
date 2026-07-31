import type { Env } from '../config/env.js';
import type { Metrics } from '../observability/metrics.js';
import type { ProviderRegistry } from '../providers/provider.registry.js';
import type { ModelRouter } from '../router/model-router.js';
import type { CodeAgentRuntime } from '../code-agent/runtime.js';

export interface AppDependencies {
  env: Env;
  registry: ProviderRegistry;
  router: ModelRouter;
  metrics: Metrics;
  startedAt: number;
  codeAgentRuntime: CodeAgentRuntime;
}
