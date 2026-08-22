import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/server';

import { generateId } from '../common/utils.js';
import type { Logger } from '../infrastructure/logger.js';
import { runWithPrincipalContext } from '../infrastructure/principal-context.js';
import type { CloudflareTelemetryEnv } from './worker-cloudflare-telemetry-runtime.js';
import { parseBoolean } from './worker-security.js';
import type { AsyncPublicJobPort } from './async-public-job-port.js';
import {
  createAsyncEnvelope,
  DEFAULT_QUEUE_OFFLOAD_TOOL_NAMES,
  MCP_ASYNC_CONTROL_TOOLS,
  resolveBoundedPositiveInt,
  type AsyncExecutionDirective,
  type AsyncJobSnapshot,
  type AsyncWorkflowDiagnostics,
} from './async-tool-workflow.js';

interface QueueBackedEnv extends CloudflareTelemetryEnv {
  ASYNC_TOOL_QUEUE?: Queue<AsyncJobMessage>;
  ASYNC_JOBS_KV?: KVNamespace;
  MCP_ASYNC_QUEUE_ENABLED?: string;
}

export type { QueueBackedEnv };

interface QueueBackedDeps {
  logger: Logger;
  isReadOnlyTool?: (toolName: string) => boolean;
  recordLatencyMetric?: (
    metric: 'queue_latency_ms' | 'async_completion_latency_ms',
    durationMs: number,
  ) => void;
  recordCostGuardrail?: (
    metric: 'queue_depth' | 'queue_latency_ms' | 'async_completion_latency_ms',
    value: number,
    threshold: number,
  ) => void;
  onAsyncJobUpdate?: (
    env: QueueBackedEnv,
    status: string,
    toolName: string,
    attempts: number,
  ) => void;
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

export type AsyncQueueDisposition =
  | {
      action: 'ack';
      reason: 'missing' | 'terminal' | 'expired' | 'cancelled' | 'succeeded' | 'permanent_failure';
    }
  | {
      action: 'retry';
      reason: 'transient_failure';
      delaySeconds: number;
    };

function snapshot(job: StoredAsyncJob): AsyncJobSnapshot {
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
  const raw = await requireJobStore(env).get(`job:${jobId}`, 'json');
  return (raw as StoredAsyncJob | null) ?? null;
}

async function writeJob(env: QueueBackedEnv, job: StoredAsyncJob): Promise<void> {
  await requireJobStore(env).put(`job:${job.id}`, JSON.stringify(job), {
    expirationTtl: Math.max(60, Math.ceil((job.expiresAtMs - Date.now()) / 1000)),
  });
}

function requireJobStore(env: QueueBackedEnv): KVNamespace {
  const kv = env.ASYNC_JOBS_KV;
  if (!kv) {
    throw new Error('ASYNC_JOBS_KV binding is missing.');
  }
  return kv;
}

function requireQueueBindings(env: QueueBackedEnv): { queue: Queue<AsyncJobMessage> } {
  requireJobStore(env);
  const queue = env.ASYNC_TOOL_QUEUE;
  if (!queue) {
    throw new Error('ASYNC_TOOL_QUEUE binding is missing.');
  }
  return { queue };
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

export function createQueuePublicJobPort(
  workflow: CloudflareAsyncQueueWorkflow,
): AsyncPublicJobPort {
  return workflow.createPublicJobPort();
}

export class CloudflareAsyncQueueWorkflow {
  private jobLifecycleListener: ((snapshot: AsyncJobSnapshot) => void) | undefined;

  constructor(
    private readonly env: QueueBackedEnv,
    private readonly deps: QueueBackedDeps,
  ) {}

  createPublicJobPort(): AsyncPublicJobPort {
    return {
      getPublicJobSnapshot: (jobId) => this.getPublicJobSnapshot(jobId),
      getPublicJobResult: (jobId) => this.getPublicJobResult(jobId),
      listPublicJobSnapshots: () => this.listPublicJobSnapshots(),
      cancelPublicJob: (jobId) => this.cancelPublicJob(jobId),
      setJobLifecycleListener: (listener) => {
        this.jobLifecycleListener = listener;
      },
    };
  }

  async getPublicJobSnapshot(jobId: string): Promise<AsyncJobSnapshot | null> {
    const job = await readJob(this.env, jobId);
    return job ? snapshot(job) : null;
  }

  async getPublicJobResult(jobId: string): Promise<CallToolResult | null> {
    const job = await readJob(this.env, jobId);
    return job?.result ?? null;
  }

  async listPublicJobSnapshots(): Promise<AsyncJobSnapshot[]> {
    const kv = requireJobStore(this.env);
    const listed = await kv.list({ prefix: 'job:' });
    const snapshots: AsyncJobSnapshot[] = [];
    for (const entry of listed.keys) {
      const jobId = entry.name.startsWith('job:') ? entry.name.slice('job:'.length) : entry.name;
      const job = await readJob(this.env, jobId);
      if (job) {
        snapshots.push(snapshot(job));
      }
    }

    return snapshots.sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
  }

  async cancelPublicJob(jobId: string): Promise<AsyncJobSnapshot | null> {
    const job = await readJob(this.env, jobId);
    if (!job) {
      return null;
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
      this.deps.onAsyncJobUpdate?.(this.env, 'cancelled', job.toolName, job.attempts.current);
    }
    await this.persistJob(job);
    return snapshot(job);
  }

  private async persistJob(job: StoredAsyncJob): Promise<void> {
    await writeJob(this.env, job);
    this.jobLifecycleListener?.(snapshot(job));
  }

  isEnabled(): boolean {
    if (!parseBoolean(this.env.MCP_ASYNC_QUEUE_ENABLED, false)) {
      return false;
    }
    requireQueueBindings(this.env);
    return true;
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

    if (request.params.name !== MCP_ASYNC_CONTROL_TOOLS.cancel) {
      return createAsyncEnvelope(
        { success: false, error: `Unsupported control tool: ${request.params.name}` },
        true,
      );
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
      this.deps.onAsyncJobUpdate?.(this.env, 'cancelled', job.toolName, job.attempts.current);
    }
    await this.persistJob(job);
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
    const { queue } = requireQueueBindings(this.env);
    if (
      !DEFAULT_QUEUE_OFFLOAD_TOOL_NAMES.has(params.request.params.name) ||
      !this.deps.isReadOnlyTool?.(params.request.params.name)
    ) {
      return createAsyncEnvelope(
        {
          success: false,
          error: 'This tool is not eligible for read-only queue execution',
        },
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
    try {
      await this.persistJob(job);
      await queue.send({ jobId: job.id });
    } catch (error) {
      const enqueueError = error instanceof Error ? error.message : String(error);
      job.status = 'failed';
      job.updatedAtMs = Date.now();
      job.error = {
        code: 'execution_failed',
        message: `Async job could not be enqueued: ${enqueueError}`,
        deadLetter: false,
        attempts: 0,
        history: [enqueueError],
      };
      try {
        await this.persistJob(job);
      } catch (persistenceError) {
        const persistenceMessage =
          persistenceError instanceof Error ? persistenceError.message : String(persistenceError);
        this.deps.logger.error(
          'Async queue enqueue failure could not be persisted',
          persistenceError instanceof Error ? persistenceError : new Error(persistenceMessage),
          { jobId: job.id },
        );
      }
      this.deps.logger.error(
        'Async queue-backed job could not be enqueued',
        error instanceof Error ? error : new Error(enqueueError),
        { jobId: job.id, toolName: job.toolName },
      );
      return createAsyncEnvelope(
        {
          success: false,
          error: 'Async tool execution could not be queued',
        },
        true,
      );
    }
    this.deps.onAsyncJobUpdate?.(this.env, 'queued', job.toolName, 0);
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
  onAsyncJobUpdate?: (
    env: QueueBackedEnv,
    status: string,
    toolName: string,
    attempts: number,
  ) => void;
}): Promise<AsyncQueueDisposition> {
  const job = await readJob(params.env, params.message.jobId);
  if (!job) return { action: 'ack', reason: 'missing' };

  const now = Date.now();
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'expired') {
    return { action: 'ack', reason: 'terminal' };
  }
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
    params.onAsyncJobUpdate?.(params.env, 'expired', job.toolName, job.attempts.current);
    return { action: 'ack', reason: 'expired' };
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
    params.onAsyncJobUpdate?.(params.env, 'cancelled', job.toolName, job.attempts.current);
    return { action: 'ack', reason: 'cancelled' };
  }

  job.status = 'running';
  job.updatedAtMs = now;
  job.attempts.current += 1;
  await writeJob(params.env, job);
  params.onAsyncJobUpdate?.(params.env, 'running', job.toolName, job.attempts.current);

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
    // Re-read job from KV to check if cancellation was requested during execution
    const freshJob = await readJob(params.env, params.message.jobId);
    if (freshJob?.cancellationRequested) {
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
    params.onAsyncJobUpdate?.(params.env, 'succeeded', job.toolName, job.attempts.current);
    return { action: 'ack', reason: 'succeeded' };
  } catch (error) {
    // Re-read job from KV to get fresh cancellation state for retry/error decisions
    const freshJobState = await readJob(params.env, params.message.jobId);
    const cancellationRequested = freshJobState?.cancellationRequested ?? false;
    job.cancellationRequested = cancellationRequested;

    const message = error instanceof Error ? error.message : String(error);
    const history = [...(job.error?.history ?? []), message];
    if (job.attempts.current < job.attempts.max && !cancellationRequested) {
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
      params.onAsyncJobUpdate?.(params.env, 'retrying', job.toolName, job.attempts.current);
      return { action: 'retry', reason: 'transient_failure', delaySeconds };
    }

    job.status = 'failed';
    job.updatedAtMs = Date.now();
    job.error = {
      code: cancellationRequested ? 'cancelled' : 'max_attempts_exceeded',
      message,
      deadLetter: !cancellationRequested,
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
    params.onAsyncJobUpdate?.(params.env, 'failed', job.toolName, job.attempts.current);
    return { action: 'ack', reason: cancellationRequested ? 'cancelled' : 'permanent_failure' };
  }
}
