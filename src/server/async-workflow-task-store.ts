import type {
  CallToolResult,
  CreateTaskResult,
  Request,
  RequestId,
  Result,
  Task,
} from '@modelcontextprotocol/server';

export type CreateTaskOptions = Record<string, unknown>;

import type { AsyncPublicJobPort } from './async-public-job-port.js';
import type { AsyncJobSnapshot, AsyncJobStatus } from './async-tool-workflow.js';

export interface TaskStore {
  createTask(
    taskParams: CreateTaskOptions,
    requestId: RequestId,
    request: Request,
    sessionId?: string,
  ): Promise<Task>;
  getTask(taskId: string, sessionId?: string): Promise<Task | null>;
  storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: Result,
    sessionId?: string,
  ): Promise<void>;
  getTaskResult(taskId: string, sessionId?: string): Promise<Result>;
  updateTaskStatus(
    taskId: string,
    status: Task['status'],
    statusMessage?: string,
    sessionId?: string,
  ): Promise<void>;
  listTasks(cursor?: string, sessionId?: string): Promise<{ tasks: Task[]; nextCursor?: string }>;
}

function mapJobStatusToTaskStatus(status: AsyncJobStatus, errorCode?: string): Task['status'] {
  switch (status) {
    case 'queued':
    case 'running':
      return 'working';
    case 'succeeded':
      return 'completed';
    case 'failed':
    case 'expired':
      return errorCode === 'cancelled' ? 'cancelled' : 'failed';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function taskFromSnapshot(snapshot: AsyncJobSnapshot, pollInterval?: number): Task {
  return {
    taskId: snapshot.id,
    status: mapJobStatusToTaskStatus(snapshot.status, snapshot.error?.code),
    ttl: Math.max(0, Date.parse(snapshot.expiresAt) - Date.now()),
    createdAt: snapshot.createdAt,
    lastUpdatedAt: snapshot.updatedAt,
    ...(pollInterval !== undefined ? { pollInterval } : {}),
    ...(snapshot.error?.message ? { statusMessage: snapshot.error.message } : {}),
  };
}

export class AsyncWorkflowTaskStore implements TaskStore {
  private readonly results = new Map<string, Result>();

  constructor(private readonly jobs: AsyncPublicJobPort) {
    this.jobs.setJobLifecycleListener((snapshot) => {
      void this.syncResultFromSnapshot(snapshot);
    });
  }

  buildCreateTaskResult(snapshot: AsyncJobSnapshot, pollInterval?: number): CreateTaskResult {
    return {
      task: taskFromSnapshot(snapshot, pollInterval),
    };
  }

  async createTask(
    _taskParams: CreateTaskOptions,
    _requestId: RequestId,
    _request: Request,
    _sessionId?: string,
  ): Promise<Task> {
    throw new Error(
      'Native MCP tasks are created via task-augmented tools/call routed through the async workflow',
    );
  }

  async getTask(taskId: string, _sessionId?: string): Promise<Task | null> {
    const snapshot = await this.jobs.getPublicJobSnapshot(taskId);
    return snapshot ? taskFromSnapshot(snapshot) : null;
  }

  async storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: Result,
    _sessionId?: string,
  ): Promise<void> {
    this.results.set(taskId, result);
    const snapshot = await this.jobs.getPublicJobSnapshot(taskId);
    if (!snapshot) {
      return;
    }

    const mappedStatus = status === 'completed' ? 'succeeded' : 'failed';
    if (snapshot.status !== mappedStatus) {
      this.results.set(taskId, result);
    }
  }

  async getTaskResult(taskId: string, _sessionId?: string): Promise<Result> {
    const stored = this.results.get(taskId);
    if (stored) {
      return stored;
    }

    const snapshot = await this.jobs.getPublicJobSnapshot(taskId);
    if (!snapshot) {
      throw new Error(`Task result not found: ${taskId}`);
    }

    if (snapshot.status === 'succeeded') {
      const result = await this.jobs.getPublicJobResult(taskId);
      if (result) {
        return result as Result;
      }
    }

    throw new Error(`Task result not ready: ${taskId}`);
  }

  async updateTaskStatus(
    taskId: string,
    status: Task['status'],
    _statusMessage?: string,
    _sessionId?: string,
  ): Promise<void> {
    if (status === 'cancelled') {
      await this.jobs.cancelPublicJob(taskId);
    }
  }

  async listTasks(
    cursor?: string,
    _sessionId?: string,
  ): Promise<{
    tasks: Task[];
    nextCursor?: string;
  }> {
    const snapshots = await this.jobs.listPublicJobSnapshots();
    const startIndex = cursor ? Number.parseInt(cursor, 10) : 0;
    const page = snapshots.slice(startIndex, startIndex + 25);
    const nextIndex = startIndex + page.length;

    return {
      tasks: page.map((entry) => taskFromSnapshot(entry)),
      ...(nextIndex < snapshots.length ? { nextCursor: String(nextIndex) } : {}),
    };
  }

  private async syncResultFromSnapshot(snapshot: AsyncJobSnapshot): Promise<void> {
    if (snapshot.status !== 'succeeded' && snapshot.status !== 'failed') {
      return;
    }

    const result = await this.jobs.getPublicJobResult(snapshot.id);
    if (result) {
      this.results.set(snapshot.id, result as Result);
    }
  }
}

export function readAsyncEnvelopeJob(result: CallToolResult): AsyncJobSnapshot | null {
  const payload = result.structuredContent;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const job = (payload as { job?: AsyncJobSnapshot }).job;
  return job?.id ? job : null;
}
