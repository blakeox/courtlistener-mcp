import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { generateId, sleep } from '../common/utils.js';
import type { Logger } from '../infrastructure/logger.js';

export type AsyncJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';

export interface AsyncExecutionDirective {
  mode?: 'sync' | 'async';
  idempotencyKey?: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  ttlSeconds?: number;
}

export interface AsyncWorkflowConfig {
  enabled?: boolean;
  queueConcurrency?: number;
  queueBatchSize?: number;
  defaultMaxAttempts?: number;
  defaultRetryDelayMs?: number;
  defaultTtlSeconds?: number;
  maxStoredJobs?: number;
  maxQueueDepth?: number;
  queueLatencyGuardrailMs?: number;
  completionLatencyGuardrailMs?: number;
  recordLatencyMetric?: (metric: 'queue_latency_ms' | 'async_completion_latency_ms', durationMs: number) => void;
  recordCostGuardrail?: (
    metric: 'queue_depth' | 'queue_latency_ms' | 'async_completion_latency_ms',
    value: number,
    threshold: number,
  ) => void;
}

export interface AsyncJobSnapshot {
  id: string;
  status: AsyncJobStatus;
  toolName: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  attempts: {
    current: number;
    max: number;
  };
  idempotencyKey?: string;
  cancellationRequested: boolean;
  error?: {
    code: 'execution_failed' | 'max_attempts_exceeded' | 'cancelled' | 'expired';
    message: string;
    deadLetter: boolean;
    attempts: number;
    history: string[];
  };
}

interface AsyncLatencyMetric {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
}

interface AsyncGuardrailSnapshot {
  threshold: number;
  breaches: number;
  lastValue: number;
}

export interface AsyncWorkflowDiagnostics {
  queueDepth: number;
  activeWorkers: number;
  latencies: {
    queueLatencyMs: { count: number; avgMs: number; maxMs: number; lastMs: number };
    completionLatencyMs: { count: number; avgMs: number; maxMs: number; lastMs: number };
  };
  guardrails: {
    queueDepth: AsyncGuardrailSnapshot;
    queueLatencyMs: AsyncGuardrailSnapshot;
    completionLatencyMs: AsyncGuardrailSnapshot;
  };
}

export const MCP_ASYNC_CONTROL_TOOLS = {
  status: 'mcp_async_get_job',
  result: 'mcp_async_get_job_result',
  cancel: 'mcp_async_cancel_job',
} as const;

const ASYNC_CONTROL_ARGUMENT_FIELD = '__mcp_async';

interface AsyncJobState {
  id: string;
  toolName: string;
  request: CallToolRequest;
  requestId: string;
  status: AsyncJobStatus;
  createdAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
  attempts: {
    current: number;
    max: number;
  };
  retryDelayMs: number;
  cancellationRequested: boolean;
  queuedAtMs: number;
  idempotencyScope?: string;
  idempotencyKey?: string;
  coalescingScope?: string;
  execute: (request: CallToolRequest, requestId: string) => Promise<CallToolResult>;
  result?: CallToolResult;
  error?: {
    code: 'execution_failed' | 'max_attempts_exceeded' | 'cancelled' | 'expired';
    message: string;
    deadLetter: boolean;
    attempts: number;
    history: string[];
  };
}

interface ResolvedAsyncWorkflowConfig {
  enabled: boolean;
  queueConcurrency: number;
  queueBatchSize: number;
  defaultMaxAttempts: number;
  defaultRetryDelayMs: number;
  defaultTtlSeconds: number;
  maxStoredJobs: number;
  maxQueueDepth: number;
  queueLatencyGuardrailMs: number;
  completionLatencyGuardrailMs: number;
  recordLatencyMetric?: AsyncWorkflowConfig['recordLatencyMetric'];
  recordCostGuardrail?: AsyncWorkflowConfig['recordCostGuardrail'];
}

export interface ParsedAsyncDirective {
  request: CallToolRequest;
  directive?: AsyncExecutionDirective;
}

export function parseAsyncExecutionDirective(request: CallToolRequest): ParsedAsyncDirective {
  const argumentsValue = request.params.arguments;
  if (
    !argumentsValue ||
    typeof argumentsValue !== 'object' ||
    Array.isArray(argumentsValue) ||
    !(ASYNC_CONTROL_ARGUMENT_FIELD in argumentsValue)
  ) {
    return { request };
  }

  const control = (argumentsValue as Record<string, unknown>)[ASYNC_CONTROL_ARGUMENT_FIELD];
  const directive = normalizeDirective(control);
  const sanitizedArguments = { ...(argumentsValue as Record<string, unknown>) };
  delete sanitizedArguments[ASYNC_CONTROL_ARGUMENT_FIELD];

  return {
    directive,
    request: {
      ...request,
      params: {
        ...request.params,
        arguments: sanitizedArguments,
      },
    },
  };
}

export function isAsyncControlToolName(name: string): name is (typeof MCP_ASYNC_CONTROL_TOOLS)[keyof typeof MCP_ASYNC_CONTROL_TOOLS] {
  return (
    name === MCP_ASYNC_CONTROL_TOOLS.status ||
    name === MCP_ASYNC_CONTROL_TOOLS.result ||
    name === MCP_ASYNC_CONTROL_TOOLS.cancel
  );
}

export function createAsyncEnvelope(payload: Record<string, unknown>, isError: boolean = false): CallToolResult {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent: payload,
    ...(isError && { isError: true }),
  };
}

export class AsyncToolWorkflowOrchestrator {
  private readonly config: ResolvedAsyncWorkflowConfig;
  private readonly logger: Logger;
  private readonly jobs = new Map<string, AsyncJobState>();
  private readonly queue: string[] = [];
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly requestCoalescingIndex = new Map<string, string>();
  private readonly queueLatency: AsyncLatencyMetric = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
  private readonly completionLatency: AsyncLatencyMetric = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
  private readonly queueDepthGuardrail = { breaches: 0, lastValue: 0 };
  private readonly queueLatencyGuardrail = { breaches: 0, lastValue: 0 };
  private readonly completionLatencyGuardrail = { breaches: 0, lastValue: 0 };
  private activeWorkers = 0;
  private drainScheduled = false;

  constructor(logger: Logger, config: AsyncWorkflowConfig = {}) {
    this.logger = logger.child('AsyncToolWorkflow');
    this.config = {
      enabled: config.enabled ?? true,
      queueConcurrency: Math.max(1, config.queueConcurrency ?? 1),
      queueBatchSize: Math.max(1, config.queueBatchSize ?? config.queueConcurrency ?? 1),
      defaultMaxAttempts: Math.max(1, config.defaultMaxAttempts ?? 3),
      defaultRetryDelayMs: Math.max(0, config.defaultRetryDelayMs ?? 500),
      defaultTtlSeconds: Math.max(1, config.defaultTtlSeconds ?? 900),
      maxStoredJobs: Math.max(100, config.maxStoredJobs ?? 2000),
      maxQueueDepth: Math.max(1, config.maxQueueDepth ?? 512),
      queueLatencyGuardrailMs: Math.max(1, config.queueLatencyGuardrailMs ?? 2_000),
      completionLatencyGuardrailMs: Math.max(1, config.completionLatencyGuardrailMs ?? 15_000),
      ...(config.recordLatencyMetric && { recordLatencyMetric: config.recordLatencyMetric }),
      ...(config.recordCostGuardrail && { recordCostGuardrail: config.recordCostGuardrail }),
    };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async handleControlToolCall(request: CallToolRequest): Promise<CallToolResult> {
    this.sweepExpiredJobs();
    const args = this.readControlArguments(request);
    if (!args.jobId) {
      return createAsyncEnvelope(
        {
          success: false,
          error: 'jobId is required',
        },
        true,
      );
    }

    if (request.params.name === MCP_ASYNC_CONTROL_TOOLS.status) {
      const snapshot = this.getJobSnapshot(args.jobId);
      if (!snapshot) {
        return this.buildNotFound(args.jobId);
      }

      return createAsyncEnvelope({
        success: true,
        mode: 'async',
        job: snapshot,
      });
    }

    if (request.params.name === MCP_ASYNC_CONTROL_TOOLS.result) {
      const job = this.jobs.get(args.jobId);
      if (!job) {
        return this.buildNotFound(args.jobId);
      }
      this.expireIfNeeded(job);
      const snapshot = this.snapshot(job);

      if (job.status === 'succeeded' && job.result) {
        return createAsyncEnvelope({
          success: true,
          mode: 'async',
          job: snapshot,
          result: job.result,
        });
      }

      if (job.status === 'failed' || job.status === 'expired') {
        return createAsyncEnvelope(
          {
            success: false,
            mode: 'async',
            job: snapshot,
            error: job.error?.message ?? `Job ${job.status}`,
          },
          true,
        );
      }

      return createAsyncEnvelope({
        success: true,
        mode: 'async',
        job: snapshot,
        result: null,
      });
    }

    const cancelled = this.cancelJob(args.jobId);
    if (!cancelled) {
      return this.buildNotFound(args.jobId);
    }

    return createAsyncEnvelope({
      success: true,
      mode: 'async',
      job: cancelled,
    });
  }

  enqueueToolCall(params: {
    request: CallToolRequest;
    requestId: string;
    userId?: string;
    directive: AsyncExecutionDirective;
    execute: (request: CallToolRequest, requestId: string) => Promise<CallToolResult>;
  }): CallToolResult {
    this.sweepExpiredJobs();
    const { request, requestId, userId, directive, execute } = params;
    const idempotencyScope = this.buildIdempotencyScope(request.params.name, userId, directive.idempotencyKey);
    const coalescingScope = this.buildRequestCoalescingScope(request.params.name, userId, request.params.arguments);
    if (idempotencyScope) {
      const existingJobId = this.idempotencyIndex.get(idempotencyScope);
      if (existingJobId) {
        const existingJob = this.jobs.get(existingJobId);
        if (existingJob && !this.expireIfNeeded(existingJob)) {
          return this.buildQueuedEnvelope(existingJob, true);
        }
        this.idempotencyIndex.delete(idempotencyScope);
      }
    }
    if (coalescingScope) {
      const existingJobId = this.requestCoalescingIndex.get(coalescingScope);
      if (existingJobId) {
        const existingJob = this.jobs.get(existingJobId);
        if (existingJob && !this.expireIfNeeded(existingJob)) {
          if (existingJob.status === 'queued' || existingJob.status === 'running') {
            return this.buildQueuedEnvelope(existingJob, true);
          }
        }
        this.requestCoalescingIndex.delete(coalescingScope);
      }
    }

    const now = Date.now();
    const job: AsyncJobState = {
      id: generateId(),
      toolName: request.params.name,
      request,
      requestId,
      status: 'queued',
      createdAtMs: now,
      updatedAtMs: now,
      expiresAtMs: now + resolveTtlSeconds(directive.ttlSeconds, this.config.defaultTtlSeconds) * 1000,
      attempts: {
        current: 0,
        max: resolveBoundedPositiveInt(directive.maxAttempts, this.config.defaultMaxAttempts),
      },
      retryDelayMs: resolveBoundedPositiveInt(directive.retryDelayMs, this.config.defaultRetryDelayMs),
      cancellationRequested: false,
      queuedAtMs: now,
      ...(idempotencyScope && { idempotencyScope }),
      ...(directive.idempotencyKey && { idempotencyKey: directive.idempotencyKey }),
      ...(coalescingScope && { coalescingScope }),
      execute,
    };

    this.jobs.set(job.id, job);
    if (idempotencyScope) {
      this.idempotencyIndex.set(idempotencyScope, job.id);
    }
    if (coalescingScope) {
      this.requestCoalescingIndex.set(coalescingScope, job.id);
    }
    this.queue.push(job.id);
    this.evaluateQueueDepthGuardrail();
    this.pruneJobs();
    this.scheduleDrain();
    return this.buildQueuedEnvelope(job, false);
  }

  private buildQueuedEnvelope(job: AsyncJobState, deduplicated: boolean): CallToolResult {
    return createAsyncEnvelope({
      success: true,
      mode: 'async',
      deduplicated,
      job: this.snapshot(job),
      controls: {
        status: {
          tool: MCP_ASYNC_CONTROL_TOOLS.status,
          arguments: { jobId: job.id },
        },
        result: {
          tool: MCP_ASYNC_CONTROL_TOOLS.result,
          arguments: { jobId: job.id },
        },
        cancel: {
          tool: MCP_ASYNC_CONTROL_TOOLS.cancel,
          arguments: { jobId: job.id },
        },
      },
    });
  }

  private getJobSnapshot(jobId: string): AsyncJobSnapshot | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    this.expireIfNeeded(job);
    return this.snapshot(job);
  }

  private cancelJob(jobId: string): AsyncJobSnapshot | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    if (this.expireIfNeeded(job)) {
      return this.snapshot(job);
    }

    if (job.status === 'queued') {
      job.cancellationRequested = true;
      this.removeFromQueue(job.id);
      this.markFailed(job, 'cancelled', 'Job cancelled before execution', false);
      return this.snapshot(job);
    }

    if (job.status === 'running') {
      job.cancellationRequested = true;
      job.updatedAtMs = Date.now();
      return this.snapshot(job);
    }

    return this.snapshot(job);
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) {
      return;
    }
    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      void this.drainQueue();
    });
  }

  private async drainQueue(): Promise<void> {
    let startedInBatch = 0;
    while (
      this.activeWorkers < this.config.queueConcurrency &&
      this.queue.length > 0 &&
      startedInBatch < this.config.queueBatchSize
    ) {
      const nextJobId = this.queue.shift();
      if (!nextJobId) {
        continue;
      }
      const job = this.jobs.get(nextJobId);
      if (!job || job.status !== 'queued') {
        continue;
      }
      if (this.expireIfNeeded(job)) {
        continue;
      }

      this.activeWorkers += 1;
      startedInBatch += 1;
      void this.executeJob(job).finally(() => {
        this.activeWorkers = Math.max(0, this.activeWorkers - 1);
        this.scheduleDrain();
      });
    }
    if (this.queue.length > 0 && this.activeWorkers < this.config.queueConcurrency) {
      this.scheduleDrain();
    }
  }

  private async executeJob(job: AsyncJobState): Promise<void> {
    if (this.expireIfNeeded(job)) {
      return;
    }

    job.status = 'running';
    const startedAtMs = Date.now();
    job.updatedAtMs = startedAtMs;
    job.attempts.current += 1;
    this.recordQueueLatency(startedAtMs - job.queuedAtMs);

    try {
      const result = await job.execute(job.request, `${job.requestId}:job:${job.id}:attempt:${job.attempts.current}`);
      if (job.cancellationRequested) {
        this.markFailed(job, 'cancelled', 'Job cancelled during execution', false);
        return;
      }

      if (result.isError) {
        throw new Error(extractToolFailure(result, job.toolName));
      }

      if (this.expireIfNeeded(job)) {
        return;
      }

      job.status = 'succeeded';
      job.result = result;
      job.updatedAtMs = Date.now();
      delete job.error;
      this.recordCompletionLatency(job.updatedAtMs - job.createdAtMs);
      if (job.coalescingScope) {
        this.requestCoalescingIndex.delete(job.coalescingScope);
      }
      this.logger.info('Async tool job succeeded', {
        jobId: job.id,
        toolName: job.toolName,
        attempts: job.attempts.current,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.expireIfNeeded(job)) {
        return;
      }

      const retryHistory = [...(job.error?.history ?? []), message];
      if (job.cancellationRequested) {
        this.markFailed(job, 'cancelled', 'Job cancelled during execution', false, retryHistory);
        return;
      }

      if (job.attempts.current < job.attempts.max) {
        job.status = 'queued';
        job.updatedAtMs = Date.now();
        job.queuedAtMs = job.updatedAtMs;
        job.error = {
          code: 'execution_failed',
          message,
          deadLetter: false,
          attempts: job.attempts.current,
          history: retryHistory,
        };

        const delayMs = job.retryDelayMs * job.attempts.current;
        this.logger.warn('Async tool job retrying', {
          jobId: job.id,
          toolName: job.toolName,
          attempt: job.attempts.current,
          maxAttempts: job.attempts.max,
          delayMs,
          error: message,
        });
        if (delayMs > 0) {
          await sleep(delayMs);
        }
        if (this.expireIfNeeded(job)) {
          return;
        }
        this.queue.push(job.id);
        this.evaluateQueueDepthGuardrail();
        this.scheduleDrain();
        return;
      }

      this.markFailed(job, 'max_attempts_exceeded', message, true, retryHistory);
    }
  }

  private markFailed(
    job: AsyncJobState,
    code: 'execution_failed' | 'max_attempts_exceeded' | 'cancelled' | 'expired',
    message: string,
    deadLetter: boolean,
    history: string[] = [],
  ): void {
    job.status = 'failed';
    job.updatedAtMs = Date.now();
    delete job.result;
    this.recordCompletionLatency(job.updatedAtMs - job.createdAtMs);
    job.error = {
      code,
      message,
      deadLetter,
      attempts: job.attempts.current,
      history,
    };
    if (job.coalescingScope) {
      this.requestCoalescingIndex.delete(job.coalescingScope);
    }
    this.logger.warn('Async tool job failed', {
      jobId: job.id,
      toolName: job.toolName,
      code,
      deadLetter,
      attempts: job.attempts.current,
      maxAttempts: job.attempts.max,
      error: message,
    });
  }

  private sweepExpiredJobs(): void {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      this.expireIfNeeded(job, now);
    }
  }

  private expireIfNeeded(job: AsyncJobState, nowMs: number = Date.now()): boolean {
    if (job.status === 'expired') {
      return true;
    }
    if (nowMs < job.expiresAtMs) {
      return false;
    }

    job.status = 'expired';
    job.updatedAtMs = nowMs;
    delete job.result;
    this.recordCompletionLatency(job.updatedAtMs - job.createdAtMs);
    job.error = {
      code: 'expired',
      message: 'Job expired before completion',
      deadLetter: false,
      attempts: job.attempts.current,
      history: [...(job.error?.history ?? [])],
    };
    this.removeFromQueue(job.id);
    if (job.idempotencyScope) {
      this.idempotencyIndex.delete(job.idempotencyScope);
    }
    if (job.coalescingScope) {
      this.requestCoalescingIndex.delete(job.coalescingScope);
    }
    return true;
  }

  private pruneJobs(): void {
    if (this.jobs.size <= this.config.maxStoredJobs) {
      return;
    }

    const terminalJobs = [...this.jobs.values()]
      .filter((job) => job.status === 'succeeded' || job.status === 'failed' || job.status === 'expired')
      .sort((a, b) => a.updatedAtMs - b.updatedAtMs);
    while (this.jobs.size > this.config.maxStoredJobs && terminalJobs.length > 0) {
      const next = terminalJobs.shift();
      if (!next) {
        break;
      }
      this.jobs.delete(next.id);
      if (next.idempotencyScope) {
        this.idempotencyIndex.delete(next.idempotencyScope);
      }
      if (next.coalescingScope) {
        this.requestCoalescingIndex.delete(next.coalescingScope);
      }
    }
  }

  private removeFromQueue(jobId: string): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index] === jobId) {
        this.queue.splice(index, 1);
      }
    }
  }

  getDiagnostics(): AsyncWorkflowDiagnostics {
    return {
      queueDepth: this.queue.length,
      activeWorkers: this.activeWorkers,
      latencies: {
        queueLatencyMs: this.snapshotLatency(this.queueLatency),
        completionLatencyMs: this.snapshotLatency(this.completionLatency),
      },
      guardrails: {
        queueDepth: {
          threshold: this.config.maxQueueDepth,
          breaches: this.queueDepthGuardrail.breaches,
          lastValue: this.queueDepthGuardrail.lastValue,
        },
        queueLatencyMs: {
          threshold: this.config.queueLatencyGuardrailMs,
          breaches: this.queueLatencyGuardrail.breaches,
          lastValue: this.queueLatencyGuardrail.lastValue,
        },
        completionLatencyMs: {
          threshold: this.config.completionLatencyGuardrailMs,
          breaches: this.completionLatencyGuardrail.breaches,
          lastValue: this.completionLatencyGuardrail.lastValue,
        },
      },
    };
  }

  private snapshotLatency(metric: AsyncLatencyMetric): { count: number; avgMs: number; maxMs: number; lastMs: number } {
    return {
      count: metric.count,
      avgMs: metric.count > 0 ? Number((metric.totalMs / metric.count).toFixed(2)) : 0,
      maxMs: Number(metric.maxMs.toFixed(2)),
      lastMs: Number(metric.lastMs.toFixed(2)),
    };
  }

  private recordQueueLatency(durationMs: number): void {
    this.recordLatencyMetric(this.queueLatency, durationMs);
    this.config.recordLatencyMetric?.('queue_latency_ms', durationMs);
    if (durationMs > this.config.queueLatencyGuardrailMs) {
      this.queueLatencyGuardrail.breaches += 1;
      this.queueLatencyGuardrail.lastValue = durationMs;
      this.config.recordCostGuardrail?.('queue_latency_ms', durationMs, this.config.queueLatencyGuardrailMs);
    }
  }

  private recordCompletionLatency(durationMs: number): void {
    this.recordLatencyMetric(this.completionLatency, durationMs);
    this.config.recordLatencyMetric?.('async_completion_latency_ms', durationMs);
    if (durationMs > this.config.completionLatencyGuardrailMs) {
      this.completionLatencyGuardrail.breaches += 1;
      this.completionLatencyGuardrail.lastValue = durationMs;
      this.config.recordCostGuardrail?.(
        'async_completion_latency_ms',
        durationMs,
        this.config.completionLatencyGuardrailMs,
      );
    }
  }

  private recordLatencyMetric(target: AsyncLatencyMetric, durationMs: number): void {
    const normalized = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    target.count += 1;
    target.totalMs += normalized;
    target.maxMs = Math.max(target.maxMs, normalized);
    target.lastMs = normalized;
  }

  private evaluateQueueDepthGuardrail(): void {
    const depth = this.queue.length;
    if (depth <= this.config.maxQueueDepth) {
      return;
    }
    this.queueDepthGuardrail.breaches += 1;
    this.queueDepthGuardrail.lastValue = depth;
    this.config.recordCostGuardrail?.('queue_depth', depth, this.config.maxQueueDepth);
  }

  private buildNotFound(jobId: string): CallToolResult {
    return createAsyncEnvelope(
      {
        success: false,
        error: `Unknown async job: ${jobId}`,
      },
      true,
    );
  }

  private readControlArguments(request: CallToolRequest): { jobId: string | null } {
    const args = request.params.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return { jobId: null };
    }
    const value = (args as Record<string, unknown>).jobId;
    if (typeof value !== 'string' || value.trim().length === 0) {
      return { jobId: null };
    }
    return { jobId: value.trim() };
  }

  private buildIdempotencyScope(toolName: string, userId: string | undefined, idempotencyKey: string | undefined): string | null {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      return null;
    }
    const principal = userId?.trim() || 'anonymous';
    return `${principal}:${toolName}:${idempotencyKey.trim()}`;
  }

  private buildRequestCoalescingScope(
    toolName: string,
    userId: string | undefined,
    args: CallToolRequest['params']['arguments'],
  ): string | null {
    if (args === undefined) {
      return null;
    }
    const principal = userId?.trim() || 'anonymous';
    const normalizedArgs = stableSerialize(args);
    return `${principal}:${toolName}:${normalizedArgs}`;
  }

  private snapshot(job: AsyncJobState): AsyncJobSnapshot {
    return {
      id: job.id,
      status: job.status,
      toolName: job.toolName,
      createdAt: new Date(job.createdAtMs).toISOString(),
      updatedAt: new Date(job.updatedAtMs).toISOString(),
      expiresAt: new Date(job.expiresAtMs).toISOString(),
      attempts: {
        current: job.attempts.current,
        max: job.attempts.max,
      },
      ...(job.idempotencyKey && { idempotencyKey: job.idempotencyKey }),
      cancellationRequested: job.cancellationRequested,
      ...(job.error && { error: job.error }),
    };
  }
}

function normalizeDirective(value: unknown): AsyncExecutionDirective {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    ...(record.mode === 'async' || record.mode === 'sync'
      ? { mode: record.mode }
      : {}),
    ...(typeof record.idempotencyKey === 'string' && record.idempotencyKey.trim().length > 0
      ? { idempotencyKey: record.idempotencyKey.trim() }
      : {}),
    ...(typeof record.maxAttempts === 'number' && Number.isFinite(record.maxAttempts)
      ? { maxAttempts: Math.max(1, Math.floor(record.maxAttempts)) }
      : {}),
    ...(typeof record.retryDelayMs === 'number' && Number.isFinite(record.retryDelayMs)
      ? { retryDelayMs: Math.max(0, Math.floor(record.retryDelayMs)) }
      : {}),
    ...(typeof record.ttlSeconds === 'number' && Number.isFinite(record.ttlSeconds)
      ? { ttlSeconds: Math.max(1, Math.floor(record.ttlSeconds)) }
      : {}),
  };
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeValueForSerialization(value));
}

function normalizeValueForSerialization(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValueForSerialization(entry));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeValueForSerialization(entryValue)] as const);
    return Object.fromEntries(entries);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

function resolveBoundedPositiveInt(input: number | undefined, fallback: number): number {
  if (input === undefined || Number.isNaN(input) || !Number.isFinite(input)) {
    return fallback;
  }
  return Math.max(1, Math.floor(input));
}

function resolveTtlSeconds(input: number | undefined, fallback: number): number {
  if (input === undefined || Number.isNaN(input) || !Number.isFinite(input)) {
    return fallback;
  }
  return Math.max(1, Math.floor(input));
}

function extractToolFailure(result: CallToolResult, toolName: string): string {
  if (!result.content || !Array.isArray(result.content) || result.content.length === 0) {
    return `Tool ${toolName} failed`;
  }
  const first = result.content[0];
  if (!first) {
    return `Tool ${toolName} failed`;
  }
  if (first.type !== 'text' || !('text' in first) || typeof first.text !== 'string') {
    return `Tool ${toolName} failed`;
  }
  try {
    const parsed = JSON.parse(first.text);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return String((parsed as { error: unknown }).error);
    }
  } catch {
    // fallback to plain text below
  }
  return first.text;
}
