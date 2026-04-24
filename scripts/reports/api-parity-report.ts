#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrapServices } from '../../src/infrastructure/bootstrap.js';
import { container } from '../../src/infrastructure/container.js';
import { CacheManager } from '../../src/infrastructure/cache.js';
import { ToolHandlerRegistry } from '../../src/server/tool-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const outputPath =
  process.env.API_PARITY_REPORT_OUTPUT || 'test-output/api-parity/api-parity-report.json';
const excludedNonCourtListenerTools = [
  'mcp_async_get_job',
  'mcp_async_get_job_result',
  'mcp_async_cancel_job',
];
const excludedClientAliasMethods = ['searchCitations'];

const internalClientMethods = new Set([
  'makeRequest',
  'endpointToOperation',
  'buildCacheTtlPolicy',
  'applyCacheTtlOverrides',
  'resolveCacheClass',
  'resolveCacheTtl',
  'buildUrl',
  'executeRequest',
  'createParamLogMetadata',
  'createUrlLogMetadata',
  'createApiError',
  'safeParseJson',
  'rateLimit',
  'refillTokens',
  'processRateLimitQueue',
  'clearRefillTimer',
]);

const handlerAliasOverrides: Record<string, string[]> = {
  get_enhanced_recap_data: ['GetEnhancedRECAPDataHandler', 'GetEnhancedRecapDataHandler'],
};

type ClientMethodInfo = {
  name: string;
  calls: string[];
  endpointHints: string[];
  directlyUsedByHandlers: boolean;
  transitivelyExposedByTools: boolean;
};

function toPascalCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

function expectedCoverageTokens(toolName: string): string[] {
  return [toolName, `${toPascalCase(toolName)}Handler`, ...(handlerAliasOverrides[toolName] ?? [])];
}

async function collectFiles(
  dir: string,
  options: { excludeDirs?: Set<string>; extensions?: Set<string> } = {},
): Promise<string[]> {
  const excludeDirs = options.excludeDirs ?? new Set<string>();
  const extensions = options.extensions ?? new Set<string>();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (excludeDirs.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, options)));
      continue;
    }
    if (extensions.size === 0 || extensions.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function buildMethodBodies(source: string): Map<string, string> {
  const methodMatches = [...source.matchAll(/^\s*async\s+([A-Za-z0-9_]+)\s*\(/gm)];
  const methodBodies = new Map<string, string>();

  for (let index = 0; index < methodMatches.length; index += 1) {
    const match = methodMatches[index];
    const nextMatch = methodMatches[index + 1];
    const methodName = match[1];
    if (!methodName || internalClientMethods.has(methodName)) continue;

    const start = match.index ?? 0;
    const end = nextMatch?.index ?? source.length;
    methodBodies.set(methodName, source.slice(start, end));
  }

  return methodBodies;
}

function collectMethodDependencies(methodBodies: Map<string, string>): Map<string, string[]> {
  const methodNames = new Set(methodBodies.keys());
  const dependencies = new Map<string, string[]>();

  for (const [methodName, body] of methodBodies.entries()) {
    const calls = [...body.matchAll(/this\.([A-Za-z0-9_]+)\s*\(/g)]
      .map((match) => match[1])
      .filter(
        (calledMethod): calledMethod is string =>
          Boolean(calledMethod) && methodNames.has(calledMethod),
      )
      .filter((calledMethod) => calledMethod !== methodName);
    dependencies.set(methodName, [...new Set(calls)]);
  }

  return dependencies;
}

function collectEndpointHints(methodBodies: Map<string, string>): Map<string, string[]> {
  const endpointHints = new Map<string, string[]>();

  for (const [methodName, body] of methodBodies.entries()) {
    const hints = [...body.matchAll(/makeRequest(?:<[^>]+>)?\(\s*[`'"]([^`'"]+)[`'"]/g)]
      .map((match) => match[1])
      .filter((value): value is string => Boolean(value));
    endpointHints.set(methodName, [...new Set(hints)]);
  }

  return endpointHints;
}

function buildTransitiveClosure(
  seedMethods: Iterable<string>,
  dependencies: Map<string, string[]>,
): Set<string> {
  const seen = new Set<string>();
  const queue = [...seedMethods];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const dependency of dependencies.get(current) ?? []) {
      if (!seen.has(dependency)) queue.push(dependency);
    }
  }

  return seen;
}

async function main() {
  bootstrapServices();
  try {
    const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    const toolDefinitions = toolRegistry
      .getToolNames()
      .sort()
      .map((toolName) => {
        const handler = toolRegistry.get(toolName);
        return {
          name: toolName,
          category: handler?.category ?? 'unknown',
        };
      });
    const toolNames = toolDefinitions.map((tool) => tool.name);

    const clientSource = await fs.readFile(path.join(repoRoot, 'src/courtlistener.ts'), 'utf8');
    const methodBodies = buildMethodBodies(clientSource);
    const methodDependencies = collectMethodDependencies(methodBodies);
    const endpointHints = collectEndpointHints(methodBodies);

    const handlerFiles = await collectFiles(path.join(repoRoot, 'src/domains'), {
      extensions: new Set(['.ts']),
    });
    const handlerTexts = await Promise.all(
      handlerFiles
        .filter((file) => file.endsWith('handlers.ts'))
        .map(async (file) => ({ file, text: await fs.readFile(file, 'utf8') })),
    );

    const directlyUsedByHandlers = new Set<string>();
    for (const methodName of methodBodies.keys()) {
      if (handlerTexts.some(({ text }) => text.includes(`.${methodName}(`))) {
        directlyUsedByHandlers.add(methodName);
      }
    }

    const transitivelyExposedMethods = buildTransitiveClosure(
      directlyUsedByHandlers,
      methodDependencies,
    );

    const testFiles = await collectFiles(path.join(repoRoot, 'test'), {
      excludeDirs: new Set(['runners', 'utils']),
      extensions: new Set(['.ts', '.js']),
    });
    const testContents = await Promise.all(
      testFiles.map(async (file) => ({ file, text: await fs.readFile(file, 'utf8') })),
    );

    const tools = toolDefinitions
      .map((tool) => {
        const coverageTokens = expectedCoverageTokens(tool.name);
        const coverageFiles = testContents
          .filter(({ text }) => coverageTokens.some((token) => text.includes(token)))
          .map(({ file }) => path.relative(repoRoot, file))
          .sort();
        return {
          name: tool.name,
          category: tool.category,
          directTestCoverage: coverageFiles.length > 0,
          coverageFiles,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    const clientMethods: ClientMethodInfo[] = [...methodBodies.keys()].sort().map((methodName) => ({
      name: methodName,
      calls: methodDependencies.get(methodName) ?? [],
      endpointHints: endpointHints.get(methodName) ?? [],
      directlyUsedByHandlers: directlyUsedByHandlers.has(methodName),
      transitivelyExposedByTools: transitivelyExposedMethods.has(methodName),
    }));
    const actionableClientMethods = clientMethods.filter(
      (method) => !excludedClientAliasMethods.includes(method.name),
    );
    const actionableClientOnlyMethods = actionableClientMethods.filter(
      (method) => !method.transitivelyExposedByTools,
    );

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        toolCount: toolNames.length,
        excludedNonCourtListenerToolCount: excludedNonCourtListenerTools.length,
        toolsWithDirectTestCoverage: tools.filter((tool) => tool.directTestCoverage).length,
        clientMethodCount: clientMethods.length,
        actionableClientMethodCount: actionableClientMethods.length,
        excludedClientAliasMethodCount: excludedClientAliasMethods.length,
        directlyUsedClientMethodCount: clientMethods.filter(
          (method) => method.directlyUsedByHandlers,
        ).length,
        transitivelyExposedClientMethodCount: clientMethods.filter(
          (method) => method.transitivelyExposedByTools,
        ).length,
        clientOnlyMethodCount: actionableClientOnlyMethods.length,
      },
      excludedNonCourtListenerTools,
      excludedClientAliasMethods,
      tools,
      clientMethods,
      clientOnlyMethods: actionableClientOnlyMethods.map((method) => ({
        name: method.name,
        endpointHints: method.endpointHints,
        kind:
          method.endpointHints.length > 0
            ? 'upstream_endpoint_or_operation'
            : 'composed_or_internal_alias',
      })),
    };

    const absoluteOutputPath = path.join(repoRoot, outputPath);
    await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await fs.writeFile(absoluteOutputPath, JSON.stringify(report, null, 2));

    console.log(
      `✅ API parity report generated (${report.summary.toolCount} CourtListener tools, ${report.summary.clientMethodCount} client methods, ${report.summary.clientOnlyMethodCount} client-only methods). Artifact: ${outputPath}`,
    );
  } finally {
    if (container.has('cache')) {
      container.get<CacheManager>('cache').destroy();
    }
    container.clearAll();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
