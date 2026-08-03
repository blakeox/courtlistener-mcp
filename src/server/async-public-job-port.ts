import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { AsyncJobSnapshot, AsyncToolWorkflowOrchestrator } from './async-tool-workflow.js';

export interface AsyncPublicJobPort {
  getPublicJobSnapshot(jobId: string): Promise<AsyncJobSnapshot | null>;
  getPublicJobResult(jobId: string): Promise<CallToolResult | null>;
  listPublicJobSnapshots(): Promise<AsyncJobSnapshot[]>;
  cancelPublicJob(jobId: string): Promise<AsyncJobSnapshot | null>;
  setJobLifecycleListener(listener: ((snapshot: AsyncJobSnapshot) => void) | undefined): void;
}

export function createOrchestratorPublicJobPort(
  orchestrator: AsyncToolWorkflowOrchestrator,
): AsyncPublicJobPort {
  return {
    getPublicJobSnapshot: async (jobId) => orchestrator.getPublicJobSnapshot(jobId),
    getPublicJobResult: async (jobId) => orchestrator.getPublicJobResult(jobId),
    listPublicJobSnapshots: async () => orchestrator.listPublicJobSnapshots(),
    cancelPublicJob: async (jobId) => orchestrator.cancelPublicJob(jobId),
    setJobLifecycleListener: (listener) => orchestrator.setJobLifecycleListener(listener),
  };
}
