import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { generateId } from '../common/utils.js';
import type { Logger } from '../infrastructure/logger.js';
import { runWithPrincipalContext } from '../infrastructure/principal-context.js';
import {
  createAsyncEnvelope,
  type AsyncExecutionDirective,
  type AsyncJobSnapshot,
  type AsyncWorkflowDiagnostics,
} from './async-tool-workflow.js';

interface QueueBackedEnv {
  ASYNC_TOOL_QUEUE?: Queue<AsyncJobMessage>;
  ASYNC_JOBS_KV?: KVNamespace;
}

interface QueueBackedDeps {
  logger: Logger;
  recordLatencyMetric?: (
    metric: 'queue_latency_ms' | 'async_completion_latency_ms',
    durationMs: number,
  ) => void;
  recordCostGuardrail?: (
    metric: 'queue_depth' | 'queue_latency_ms' | 'async_completion_latency_ms',
    value: number,
    threshold: number,
  ) => void;
  onAsyncJobUpdate?: (status: string, toolName: string, attempts: number) => void;
}

interface StoredAsyncJob {
  id: string;
  toolName: string;
  request: CallToolRequest;
  requestId: string;
  userId?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';
  createdAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
  attempts: {
    current: number;
    max: number;
  };
  retryDelayMs: number;
  idempotencyKey?: string;
  cancellationRequested: boolean;
  queuedAtMs: number;
  result?: CallToolResult;
  error?: {
    code: 'execution_failed' | 'max_attempts_exceeded' | 'cancelled' | 'expired';
    message: string;
    deadLetter: boolean;
    attempts: number;
    history: string[];
  };
}

export interface AsyncJobMessage {
  jobId: string;
}

function resolveBoundedPositiveInt(input: number | undefined, fallback: number): number {
  if (input === undefined || Number.isNaN(input) || !Number.isFinite(input)) {
    return fallback;
  }
  return Math.max(1, Math.floor(input));
}

function snapshot(job: StoredAsyncJob): AsyncJobSnapshot {
  return {
    id: job.id,
    status: job.status,
    toolName: job.toolName,
    createdAt: new Date(job.createdAtMs).toISOString(),
    updatedAt: new Date(job.updatedAtMs).toISOString(),
    expiresAt: new Date(job.expiresAtMs).toISOString(),
    attempts: job.attempts,
    ...(job.idempotencyKey ? { idempotencyKey: job.idempotencyKey } : {}),
    cancellationRequested: job.cancellationRequested,
    ...(job.error ? { error: job.error } : {}),
  };
}

function buildQueuedEnvelope(job: StoredAsyncJob, deduplicated: boolean): CallToolResult {
  return createAsyncEnvelope({
    success: true,
    mode: 'async',
    deduplicated,
    job: snapshot(job),
    controls: {
      status: {
        tool: 'mcp_async_get_job',
        arguments: { jobId: job.id },
      },
      result: {
        tool: 'mcp_async_get_job_result',
        arguments: { jobId: job.id },
      },
      cancel: {
        tool: 'mcp_async_cancel_job',
        arguments: { jobId: job.id },
      },
    },
  });
}

function buildNotFound(jobId: string): CallToolResult {
  return createAsyncEnvelope(
    {
      success: false,
      error: `Unknown async job: ${jobId}`,
    },
    true,
  );
}

async function readJob(env: QueueBackedEnv, jobId: string): Promise<StoredAsyncJob | null> {
  const raw = await env.ASYNC_JOBS_KV?.get(`job:${jobId}`, 'json');
  return (raw as StoredAsyncJob | null) ?? null;
}

async function writeJob(env: QueueBackedEnv, job: StoredAsyncJob): Promise<void> {
  await env.ASYNC_JOBS_KV?.put(`job:${job.id}`, JSON.stringify(job), {
    expirationTtl: Math.max(60, Math.ceil((job.expiresAtMs - Date.now()) / 1000)),
  });
}

function readControlArguments(request: CallToolRequest): { jobId: string | null } {
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

export class CloudflareAsyncQueueWorkflow {
  constructor(
    private readonly env: QueueBackedEnv,
    private readonly deps: QueueBackedDeps,
  ) {}

  isEnabled(): boolean {
    return Boolean(this.env.ASYNC_TOOL_QUEUE && this.env.ASYNC_JOBS_KV);
  }

  async handleControlToolCall(request: CallToolRequest): Promise<CallToolResult> {
    const args = readControlArguments(request);
    if (!args.jobId) {
      return createAsyncEnvelope({ success: false, error: 'jobId is required' }, true);
    }
    const job = await readJob(this.env, args.jobId);
    if (!job) {
      return buildNotFound(args.jobId);
    }

    if (request.params.name === 'mcp_async_get_job') {
      return createAsyncEnvelope({ success: true, mode: 'async', job: snapshot(job) });
    }

    if (request.params.name === 'mcp_async_get_job_result') {
      if (job.status === 'succeeded' && job.result) {
        return createAsyncEnvelope({
          success: true,
          mode: 'async',
          job: snapshot(job),
          result: job.result,
        });
      }
      if (job.status === 'failed' || job.status === 'expired') {
        return createAsyncEnvelope(
          {
            success: false,
            mode: 'async',
            job: snapshot(job),
            error: job.error?.message ?? `Job ${job.status}`,
          },
          true,
        );
      }
      return createAsyncEnvelope({
        success: true,
        mode: 'async',
        job: snapshot(job),
        result: null,
      });
    }

    job.cancellationRequested = true;
    if (job.status === 'queued') {
      job.status = 'failed';
      job.updatedAtMs = Date.now();
      job.error = {
        code: 'cancelled',
        message: 'Job cancelled before execution',
        deadLetter: false,
        attempts: job.attempts.current,
        history: [],
      };
      this.deps.onAsyncJobUpdate?.('cancelled', job.toolName, job.attempts.current);
    }
    await writeJob(this.env, job);
    return createAsyncEnvelope({ success: true, mode: 'async', job: snapshot(job) });
  }

  async enqueueToolCall(params: {
    request: CallToolRequest;
    requestId: string;
    userId?: string;
    directive: AsyncExecutionDirective;
    execute?: (request: CallToolRequest, requestId: string) => Promise<CallToolResult>;
  }): Promise<CallToolResult> {
    if (!this.isEnabled()) {
      return createAsyncEnvelope(
        { success: false, error: 'Async tool execution is disabled' },
        true,
      );
    }
    const queue = this.env.ASYNC_TOOL_QUEUE;
    if (!queue) {
      return createAsyncEnvelope(
        { success: false, error: 'Async tool execution queue is unavailable' },
        true,
      );
    }

    const now = Date.now();
    const job: StoredAsyncJob = {
      id: generateId(),
      toolName: params.request.params.name,
      request: params.request,
      requestId: params.requestId,
      ...(params.userId ? { userId: params.userId } : {}),
      status: 'queued',
      createdAtMs: now,
      updatedAtMs: now,
      expiresAtMs: now + resolveBoundedPositiveInt(params.directive.ttlSeconds, 900) * 1000,
      attempts: {
        current: 0,
        max: resolveBoundedPositiveInt(params.directive.maxAttempts, 3),
      },
      retryDelayMs: Math.max(0, Math.floor(params.directive.retryDelayMs ?? 500)),
      ...(params.directive.idempotencyKey
        ? { idempotencyKey: params.directive.idempotencyKey }
        : {}),
      cancellationRequested: false,
      queuedAtMs: now,
    };
    await writeJob(this.env, job);
    await queue.send({ jobId: job.id });
    this.deps.onAsyncJobUpdate?.('queued', job.toolName, 0);
    return buildQueuedEnvelope(job, false);
  }

  getDiagnostics(): AsyncWorkflowDiagnostics {
    return {
      queueDepth: 0,
      activeWorkers: 0,
      latencies: {
        queueLatencyMs: { count: 0, avgMs: 0, maxMs: 0, lastMs: 0 },
        completionLatencyMs: { count: 0, avgMs: 0, maxMs: 0, lastMs: 0 },
      },
      guardrails: {
        queueDepth: { threshold: 0, breaches: 0, lastValue: 0 },
        queueLatencyMs: { threshold: 0, breaches: 0, lastValue: 0 },
        completionLatencyMs: { threshold: 0, breaches: 0, lastValue: 0 },
      },
    };
  }
}

export async function processAsyncQueueMessage(params: {
  env: QueueBackedEnv;
  logger: Logger;
  message: AsyncJobMessage;
  execute: (
    request: CallToolRequest,
    requestId: string,
    userId?: string,
  ) => Promise<CallToolResult>;
  onAsyncJobUpdate?: (status: string, toolName: string, attempts: number) => void;
}): Promise<void> {
  const job = await readJob(params.env, params.message.jobId);
  if (!job) return;

  const now = Date.now();
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'expired') return;
  if (job.expiresAtMs <= now) {
    job.status = 'expired';
    job.updatedAtMs = now;
    job.error = {
      code: 'expired',
      message: 'Job expired before completion',
      deadLetter: false,
      attempts: job.attempts.current,
      history: [...(job.error?.history ?? [])],
    };
    await writeJob(params.env, job);
    params.onAsyncJobUpdate?.('expired', job.toolName, job.attempts.current);
    return;
  }
  if (job.cancellationRequested) {
    job.status = 'failed';
    job.updatedAtMs = now;
    job.error = {
      code: 'cancelled',
      message: 'Job cancelled before execution',
      deadLetter: false,
      attempts: job.attempts.current,
      history: [...(job.error?.history ?? [])],
    };
    await writeJob(params.env, job);
    params.onAsyncJobUpdate?.('cancelled', job.toolName, job.attempts.current);
    return;
  }

  job.status = 'running';
  job.updatedAtMs = now;
  job.attempts.current += 1;
  await writeJob(params.env, job);
  params.onAsyncJobUpdate?.('running', job.toolName, job.attempts.current);

  try {
    const result = await runWithPrincipalContext(
      job.userId ? { userId: job.userId, authMethod: 'oidc' } : undefined,
      () =>
        params.execute(
          job.request,
          `${job.requestId}:job:${job.id}:attempt:${job.attempts.current}`,
          job.userId,
        ),
    );
    if (job.cancellationRequested) {
      throw new Error('Job cancelled during execution');
    }
    if (result.isError) {
      throw new Error(`Tool ${job.toolName} failed`);
    }
    job.status = 'succeeded';
    job.updatedAtMs = Date.now();
    job.result = result;
    delete job.error;
    await writeJob(params.env, job);
    params.onAsyncJobUpdate?.('succeeded', job.toolName, job.attempts.current);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const history = [...(job.error?.history ?? []), message];
    if (job.attempts.current < job.attempts.max && !job.cancellationRequested) {
      job.status = 'queued';
      job.updatedAtMs = Date.now();
      job.queuedAtMs = job.updatedAtMs;
      job.error = {
        code: 'execution_failed',
        message,
        deadLetter: false,
        attempts: job.attempts.current,
        history,
      };
      await writeJob(params.env, job);
      const delaySeconds = Math.max(0, Math.ceil((job.retryDelayMs * job.attempts.current) / 1000));
      await params.env.ASYNC_TOOL_QUEUE?.send(
        { jobId: job.id },
        delaySeconds > 0 ? { delaySeconds } : undefined,
      );
      params.onAsyncJobUpdate?.('retrying', job.toolName, job.attempts.current);
      return;
    }

    job.status = 'failed';
    job.updatedAtMs = Date.now();
    job.error = {
      code: job.cancellationRequested ? 'cancelled' : 'max_attempts_exceeded',
      message,
      deadLetter: !job.cancellationRequested,
      attempts: job.attempts.current,
      history,
    };
    delete job.result;
    await writeJob(params.env, job);
    params.logger.warn('Async queue-backed job failed', {
      jobId: job.id,
      toolName: job.toolName,
      error: message,
      attempts: job.attempts.current,
      maxAttempts: job.attempts.max,
    });
    params.onAsyncJobUpdate?.('failed', job.toolName, job.attempts.current);
  }
}
