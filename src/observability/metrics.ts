import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export class Metrics {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'ai_router_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    registers: [this.registry],
  });

  readonly chatRequestsTotal = new Counter({
    name: 'ai_router_chat_requests_total',
    help: 'Total chat completion requests handled',
    labelNames: ['provider', 'model', 'status'] as const,
    registers: [this.registry],
  });

  readonly chatRequestDuration = new Histogram({
    name: 'ai_router_chat_request_duration_seconds',
    help: 'Chat completion latency by provider and model, in seconds',
    labelNames: ['provider', 'model', 'status'] as const,
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 40],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'ai_router_' });
  }
}
