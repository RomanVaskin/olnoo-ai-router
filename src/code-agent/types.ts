export const CODE_AGENT_STATUSES = [
  'queued', 'preparing', 'running', 'validating', 'starting_preview',
  'ready_for_preview', 'publish_pending', 'publishing', 'published',
  'discarding', 'discarded', 'failed', 'timed_out', 'cancelled',
] as const;

export type CodeAgentStatus = (typeof CODE_AGENT_STATUSES)[number];
export type CodeAgentCheck = { name: string; ok: boolean; output: string };
export type CodeAgentEvent = { id: number; at: string; status: CodeAgentStatus; message: string };
export type CodeAgentJob = {
  jobId: string;
  requestId: string;
  projectId: 'a-istra';
  provider: 'codex';
  mode: 'preview_only';
  status: CodeAgentStatus;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  changedFiles: string[];
  diff?: string;
  checks: CodeAgentCheck[];
  previewUrl?: string;
  events: CodeAgentEvent[];
  error?: string;
  attachments: string[];
};

export interface CodeAgentProvider {
  start(input: { worktreePath: string; prompt: string; signal: AbortSignal; onEvent: (message: string) => void }): Promise<{ summary: string }>;
  cancel(runId: string): Promise<void>;
}
