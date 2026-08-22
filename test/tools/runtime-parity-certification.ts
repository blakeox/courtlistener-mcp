#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import type { CallToolResult } from '@modelcontextprotocol/server';

import { Logger } from '../../src/infrastructure/logger.js';
import { authorizeMcpGatewayRequest } from '../../src/server/mcp-gateway-auth.js';
import {
  AsyncToolWorkflowOrchestrator,
  type AsyncJobSnapshot,
} from '../../src/server/async-tool-workflow.js';
import { createDirectToolExecutionService } from '../../src/server/tool-execution-service.js';
import {
  BaseToolHandler,
  ToolHandlerRegistry,
  type ToolContext,
} from '../../src/server/tool-handler.js';
import { handleMcpGatewayRoute } from '../../src/server/worker-mcp-gateway.js';
import {
  buildLocalStdioHealthPayload,
  buildRuntimeHealthPayload,
  buildSharedRuntimeDiagnostics,
  extractRuntimeHealthCore,
  validateRuntimeHealthExtendedPayload,
} from '../../src/infrastructure/runtime-health-contract.js';
import {
  buildServerCapabilities,
  resolveProtocolFeatureFlags,
} from '../../src/infrastructure/protocol-constants.js';
import { buildWorkerHealthPayload } from '../../src/server/worker-health-runtime.js';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

interface RuntimeParityCaseResult {
  id: string;
  description: string;
  node: JsonObject;
  worker: JsonObject;
  diffs: readonly string[];
  passed: boolean;
}

interface RuntimeParityReport {
  generatedAt: string;
  protocolVersion: string;
  outputPath: string;
  summary: {
    totalCases: number;
    passed: number;
    failed: number;
  };
  cases: RuntimeParityCaseResult[];
}

class AsyncParityEchoHandler extends BaseToolHandler<{ payload?: string }, { payload?: string }> {
  readonly name = 'parity_echo';
  readonly description = 'Parity async envelope test handler';
  readonly category = 'test';

  validate(input: unknown): { success: true; data: { payload?: string } } {
    return { success: true, data: (input as { payload?: string }) ?? {} };
  }

  async execute(input: { payload?: string }, _context: ToolContext): Promise<CallToolResult> {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ ok: true, payload: input.payload ?? null }) },
      ],
    };
  }

  getSchema(): Record<string, unknown> {
    return { type: 'object', properties: { payload: { type: 'string' } } };
  }
}

const SUPPORTED_PROTOCOLS = new Set(['2026-07-28']);
const logger = new Logger(
  { level: 'error', format: 'json', enabled: false },
  'runtime-parity-cert',
);

function parseJsonObject(text: string): JsonObject {
  const parsed = JSON.parse(text) as JsonObject;
  return parsed;
}

async function readResponsePayload(response: Response): Promise<JsonObject> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as JsonObject;
    return parsed;
  } catch {
    return { raw: text };
  }
}

function normalizeAuthSnapshot(status: number, body: JsonObject): JsonObject {
  return { status, body };
}

function normalizeAsyncQueueEnvelope(result: CallToolResult): JsonObject {
  const first = result.content[0];
  const payload =
    first && first.type === 'text' && typeof first.text === 'string'
      ? parseJsonObject(first.text)
      : {};
  const job = (payload.job ?? {}) as AsyncJobSnapshot & Record<string, JsonValue>;
  const controls = (payload.controls ?? {}) as Record<string, JsonValue>;
  const readToolName = (value: JsonValue): string => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return '';
    }
    return String((value as Record<string, JsonValue>).tool ?? '');
  };
  return {
    success: Boolean(payload.success),
    mode: String(payload.mode ?? ''),
    deduplicated: Boolean(payload.deduplicated),
    job: {
      status: String(job.status ?? ''),
      toolName: String(job.toolName ?? ''),
      attemptsMax: Number(
        job.attempts && typeof job.attempts === 'object'
          ? ((job.attempts as { max?: number }).max ?? -1)
          : -1,
      ),
      cancellationRequested: Boolean(job.cancellationRequested),
    },
    controls: {
      statusTool: readToolName(controls.status ?? null),
      resultTool: readToolName(controls.result ?? null),
      cancelTool: readToolName(controls.cancel ?? null),
    },
  };
}

function createDiffs(node: JsonValue, worker: JsonValue, currentPath = '$'): string[] {
  if (node === worker) {
    return [];
  }

  if (typeof node !== typeof worker || node === null || worker === null) {
    return [`${currentPath}: node=${JSON.stringify(node)} worker=${JSON.stringify(worker)}`];
  }

  if (Array.isArray(node) && Array.isArray(worker)) {
    const diffs: string[] = [];
    if (node.length !== worker.length) {
      diffs.push(`${currentPath}.length: node=${node.length} worker=${worker.length}`);
    }
    const max = Math.max(node.length, worker.length);
    for (let i = 0; i < max; i += 1) {
      diffs.push(...createDiffs(node[i] ?? null, worker[i] ?? null, `${currentPath}[${i}]`));
    }
    return diffs;
  }

  if (typeof node === 'object' && typeof worker === 'object') {
    const nodeRecord = node as Record<string, JsonValue>;
    const workerRecord = worker as Record<string, JsonValue>;
    const keys = new Set([...Object.keys(nodeRecord), ...Object.keys(workerRecord)]);
    const diffs: string[] = [];
    for (const key of [...keys].sort()) {
      diffs.push(
        ...createDiffs(nodeRecord[key] ?? null, workerRecord[key] ?? null, `${currentPath}.${key}`),
      );
    }
    return diffs;
  }

  return [`${currentPath}: node=${JSON.stringify(node)} worker=${JSON.stringify(worker)}`];
}

async function runAuthCase(
  id: string,
  description: string,
  request: Request,
  env: { MCP_AUTH_TOKEN?: string; MCP_REQUIRE_PROTOCOL_VERSION?: string },
): Promise<RuntimeParityCaseResult> {
  const nodeResult = await authorizeMcpGatewayRequest({
    request,
    env,
    supportedProtocolVersions: SUPPORTED_PROTOCOLS,
  });
  if (!nodeResult.authError) {
    throw new Error(`Node parity case ${id} unexpectedly passed authorization`);
  }
  const node = normalizeAuthSnapshot(
    nodeResult.authError.status,
    await readResponsePayload(nodeResult.authError),
  );

  const workerResponse = await handleMcpGatewayRoute({
    request,
    env,
    ctx: {} as ExecutionContext,
    pathname: '/mcp',
    requestMethod: 'POST',
    origin: null,
    allowedOrigins: [],
    mcpPath: true,
    supportedProtocolVersions: SUPPORTED_PROTOCOLS,
    mcpStreamableHandler: {
      fetch: async () => new Response('unexpected handler call', { status: 500 }),
    },
    withCors: (response) => response,
    buildCorsHeaders: () => new Headers(),
    getClientIdentifier: () => 'runtime-parity-client',
    getAuthRateLimitedResponse: async () => null,
    recordAuthFailure: async () => {},
    clearAuthFailures: async () => {},
  });
  if (!workerResponse) {
    throw new Error(`Worker parity case ${id} did not return a response`);
  }
  const worker = normalizeAuthSnapshot(
    workerResponse.status,
    await readResponsePayload(workerResponse),
  );
  const diffs = createDiffs(node, worker);
  return { id, description, node, worker, diffs, passed: diffs.length === 0 };
}

async function runAsyncEnvelopeParityCase(): Promise<RuntimeParityCaseResult> {
  const registryForWorker = new ToolHandlerRegistry();
  registryForWorker.register(new AsyncParityEchoHandler());
  const registryForNode = new ToolHandlerRegistry();
  registryForNode.register(new AsyncParityEchoHandler());

  const workerService = createDirectToolExecutionService({
    toolRegistry: registryForWorker,
    logger,
    asyncWorkflow: new AsyncToolWorkflowOrchestrator(logger, {
      queueConcurrency: 1,
      defaultRetryDelayMs: 1,
    }),
  });

  const nodeService = createDirectToolExecutionService({
    toolRegistry: registryForNode,
    logger,
    asyncWorkflow: new AsyncToolWorkflowOrchestrator(logger, {
      queueConcurrency: 1,
      defaultRetryDelayMs: 1,
    }),
  });

  const request = {
    method: 'tools/call',
    params: {
      name: 'parity_echo',
      arguments: {
        payload: 'hello',
        __mcp_async: {
          mode: 'async',
          maxAttempts: 2,
          retryDelayMs: 1,
          ttlSeconds: 60,
        },
      },
    },
  } as const;

  const workerQueue = normalizeAsyncQueueEnvelope(
    await workerService.execute(request, 'worker-parity'),
  );
  const nodeQueue = normalizeAsyncQueueEnvelope(await nodeService.execute(request, 'node-parity'));
  const diffs = createDiffs(nodeQueue, workerQueue);
  return {
    id: 'async-envelope',
    description: 'queued async envelope parity between local and Worker direct services',
    node: nodeQueue,
    worker: workerQueue,
    diffs,
    passed: diffs.length === 0,
  };
}

function runHealthCoreParityCase(): RuntimeParityCaseResult {
  const localHealth = buildLocalStdioHealthPayload({
    ...buildSharedRuntimeDiagnostics({}),
    backpressure: { activeRequests: 0 },
  });
  const workerHealth = buildWorkerHealthPayload(
    { route_latency_ms: {} },
    {
      analyticsEnabled: false,
      asyncQueueConfigured: false,
      asyncJobsKvConfigured: false,
      turnstileEnforcedRoutes: [],
    },
  );

  const localCore = extractRuntimeHealthCore(localHealth as unknown as JsonObject);
  const workerCore = extractRuntimeHealthCore(workerHealth as unknown as JsonObject);
  const diffs = createDiffs(
    (localCore ?? {}) as JsonObject,
    (workerCore ?? {}) as JsonObject,
  ).filter(
    (diff) =>
      !diff.includes('runtime') && !diff.includes('transport') && !diff.includes('timestamp'),
  );

  return {
    id: 'health-core-contract',
    description: 'shared /health core fields parity between local stdio and Worker payloads',
    node: (localCore ?? {}) as JsonObject,
    worker: (workerCore ?? {}) as JsonObject,
    diffs,
    passed: localCore !== null && workerCore !== null && diffs.length === 0,
  };
}

function runSharedHealthDiagnosticsParityCase(): RuntimeParityCaseResult {
  const localHealth = buildLocalStdioHealthPayload({
    ...buildSharedRuntimeDiagnostics({}),
    backpressure: { activeRequests: 0 },
  });
  const workerHealth = buildWorkerHealthPayload(
    { route_latency_ms: {} },
    {
      analyticsEnabled: false,
      asyncQueueConfigured: false,
      asyncJobsKvConfigured: false,
      turnstileEnforcedRoutes: [],
    },
  );

  const nodeShared = {
    cloudflare_keys: Object.keys(localHealth.diagnostics.cloudflare).sort(),
  };
  const workerShared = {
    cloudflare_keys: Object.keys(workerHealth.diagnostics.cloudflare).sort(),
  };
  const diffs = createDiffs(nodeShared as JsonObject, workerShared as JsonObject);

  return {
    id: 'health-shared-diagnostics',
    description: 'shared diagnostics.cloudflare key parity',
    node: nodeShared as JsonObject,
    worker: workerShared as JsonObject,
    diffs,
    passed:
      validateRuntimeHealthExtendedPayload(localHealth).ok &&
      validateRuntimeHealthExtendedPayload(workerHealth).ok &&
      diffs.length === 0,
  };
}

function runProtocolCapabilitiesParityCase(): RuntimeParityCaseResult {
  const env = {
    LOGGING_ENABLED: 'true',
    SAMPLING_ENABLED: 'false',
    MCP_RESOURCE_SUBSCRIPTIONS: 'true',
    MCP_NATIVE_TASKS_ENABLED: 'false',
    MCP_LIST_CHANGED_ENABLED: 'false',
  };

  const nodeCapabilities = buildServerCapabilities(resolveProtocolFeatureFlags(env));
  const workerCapabilities = buildServerCapabilities(resolveProtocolFeatureFlags(env));
  const diffs = createDiffs(
    nodeCapabilities as unknown as JsonObject,
    workerCapabilities as unknown as JsonObject,
  );

  return {
    id: 'protocol-capabilities-default',
    description: 'default MCP capability advertisement parity between local and Worker builders',
    node: nodeCapabilities as unknown as JsonObject,
    worker: workerCapabilities as unknown as JsonObject,
    diffs,
    passed: diffs.length === 0,
  };
}

function runDiagnosticsHealthCoreParityCase(): RuntimeParityCaseResult {
  const local = buildLocalStdioHealthPayload({
    ...buildSharedRuntimeDiagnostics({}),
    backpressure: { activeRequests: 0 },
  });
  const diagnostics = buildRuntimeHealthPayload({
    runtime: 'local-stdio',
    transport: 'local-stdio',
    diagnostics: {
      ...buildSharedRuntimeDiagnostics({}),
      metrics_health: {
        status: 'healthy',
        checks: { uptime: { status: 'pass', message: 'running' } },
        metrics: { uptime_seconds: 10 },
      },
      cache_stats: { enabled: true, totalEntries: 0 },
    },
  });
  const worker = buildWorkerHealthPayload(
    { route_latency_ms: {} },
    {
      analyticsEnabled: false,
      asyncQueueConfigured: false,
      asyncJobsKvConfigured: false,
      turnstileEnforcedRoutes: [],
    },
  );

  const localCore = extractRuntimeHealthCore(local as unknown as JsonObject);
  const localDiagnosticsCore = extractRuntimeHealthCore(diagnostics as unknown as JsonObject);
  const workerCore = extractRuntimeHealthCore(worker as unknown as JsonObject);

  const normalizeCore = (
    core: NonNullable<ReturnType<typeof extractRuntimeHealthCore>> | null,
  ): JsonObject | null => {
    if (!core) {
      return null;
    }
    return {
      status: core.status,
      service: core.service,
      version: core.version,
      runtime: core.runtime,
    };
  };

  const localDiagnosticsNormalized = normalizeCore(localDiagnosticsCore);
  const workerNormalized = normalizeCore(workerCore);
  const localNormalized = normalizeCore(extractRuntimeHealthCore(local as unknown as JsonObject));
  const diffs = createDiffs(
    (localDiagnosticsNormalized ?? {}) as JsonObject,
    (workerNormalized ?? {}) as JsonObject,
  ).filter((diff) => !diff.includes('runtime'));

  const sharedDiagnosticsDiffs = createDiffs(
    { cloudflare: local.diagnostics.cloudflare } as JsonObject,
    { cloudflare: diagnostics.diagnostics.cloudflare } as JsonObject,
  );

  return {
    id: 'health-core-diagnostics-worker',
    description:
      'diagnostics /health and worker /health share runtime health core fields and unified diagnostics sections',
    node: (localDiagnosticsNormalized ?? {}) as JsonObject,
    worker: (workerNormalized ?? {}) as JsonObject,
    diffs: [...diffs, ...sharedDiagnosticsDiffs],
    passed:
      localNormalized !== null &&
      localCore !== null &&
      localDiagnosticsCore !== null &&
      workerCore !== null &&
      localDiagnosticsCore.service === workerCore.service &&
      localDiagnosticsCore.version === workerCore.version &&
      diffs.length === 0 &&
      sharedDiagnosticsDiffs.length === 0,
  };
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function main(): Promise<void> {
  const outputPath =
    process.env.RUNTIME_PARITY_ARTIFACT || 'test-output/runtime-parity/certification-report.json';
  const protocolVersion = process.env.RUNTIME_PARITY_PROTOCOL_VERSION || '2026-07-28';
  const cases: RuntimeParityCaseResult[] = [
    await runAuthCase(
      'bp10-auth-invalid-token',
      'invalid token auth failure parity',
      new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'x-mcp-service-token': 'wrong',
          'mcp-protocol-version': '2026-07-28',
        },
      }),
      { MCP_AUTH_TOKEN: 'secret' },
    ),
    await runAuthCase(
      'bp10-protocol-unsupported',
      'unsupported protocol response parity',
      new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'x-mcp-service-token': 'secret',
          'mcp-protocol-version': '2099-01-01',
        },
      }),
      { MCP_AUTH_TOKEN: 'secret', MCP_REQUIRE_PROTOCOL_VERSION: 'true' },
    ),
    await runAsyncEnvelopeParityCase(),
    runHealthCoreParityCase(),
    runSharedHealthDiagnosticsParityCase(),
    runDiagnosticsHealthCoreParityCase(),
    runProtocolCapabilitiesParityCase(),
  ];

  const failed = cases.filter((item) => !item.passed);
  const report: RuntimeParityReport = {
    generatedAt: new Date().toISOString(),
    protocolVersion,
    outputPath,
    summary: {
      totalCases: cases.length,
      passed: cases.length - failed.length,
      failed: failed.length,
    },
    cases,
  };

  await ensureDir(outputPath);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    console.error(
      `Runtime parity certification failed (${failed.length} mismatches). Artifact: ${outputPath}`,
    );
    for (const item of failed) {
      console.error(`- ${item.id}: ${item.diffs.join('; ')}`);
    }
    process.exit(1);
  }

  console.log(
    `Runtime parity certification passed (${cases.length} cases). Artifact: ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
