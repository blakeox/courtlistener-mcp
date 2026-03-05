import { mcpCall, toErrorMessage } from './api';

interface McpToolSurface {
  name: string;
  description: string;
  category: string;
  requiredArgs: string[];
  constrainedArgs: number;
}

interface McpResourceSurface {
  uri: string;
  name: string;
  description: string;
}

interface McpPromptSurface {
  name: string;
  description: string;
  argumentCount: number;
}

export interface McpRuntimeReadinessResult {
  ready: true;
  sessionId: string;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  protocolVersion: string;
  serverName: string;
  serverVersion: string;
  capabilities: string[];
  toolCategories: string[];
  tools: McpToolSurface[];
  resources: McpResourceSurface[];
  prompts: McpPromptSurface[];
  guardrails: string[];
  diagnostics: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getResultRecord(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) return null;
  return asRecord(root.result) ?? root;
}

function extractArray(payload: unknown, key: 'tools' | 'resources' | 'prompts'): unknown[] {
  const record = getResultRecord(payload);
  if (!record) return [];
  const items = record[key];
  return Array.isArray(items) ? items : [];
}

function extractToolCategories(payload: unknown): string[] {
  const root = asRecord(payload);
  const result = asRecord(root?.result);
  const metadata = asRecord(result?.metadata) ?? asRecord(root?.metadata);
  const categories = metadata?.categories;
  if (!Array.isArray(categories)) return [];
  return categories.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function extractCapabilities(payload: unknown): string[] {
  const result = getResultRecord(payload);
  const capabilities = asRecord(result?.capabilities);
  if (!capabilities) return [];

  return Object.entries(capabilities)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => {
      const detail = asRecord(value);
      if (!detail) return key;
      const flags = Object.entries(detail)
        .filter(([, flag]) => Boolean(flag))
        .map(([flag]) => flag);
      return flags.length > 0 ? `${key} (${flags.join(', ')})` : key;
    });
}

function extractProtocolVersion(payload: unknown): string {
  const result = getResultRecord(payload);
  return typeof result?.protocolVersion === 'string' ? result.protocolVersion : 'unknown';
}

function extractServerInfo(payload: unknown): { name: string; version: string } {
  const result = getResultRecord(payload);
  const serverInfo = asRecord(result?.serverInfo);
  return {
    name: typeof serverInfo?.name === 'string' ? serverInfo.name : 'unknown',
    version: typeof serverInfo?.version === 'string' ? serverInfo.version : 'unknown',
  };
}

function countConstrainedArguments(inputSchema: Record<string, unknown> | null): number {
  const properties = asRecord(inputSchema?.properties);
  if (!properties) return 0;

  return Object.values(properties).reduce((count, propertySchema) => {
    const schema = asRecord(propertySchema);
    if (!schema) return count;
    if (
      'minimum' in schema
      || 'maximum' in schema
      || 'minLength' in schema
      || 'maxLength' in schema
      || 'enum' in schema
      || 'pattern' in schema
    ) {
      return count + 1;
    }
    return count;
  }, 0);
}

function extractTools(payload: unknown): McpToolSurface[] {
  return extractArray(payload, 'tools')
    .map((rawTool) => {
      const tool = asRecord(rawTool);
      if (!tool || typeof tool.name !== 'string') return null;
      const metadata = asRecord(tool.metadata);
      const inputSchema = asRecord(tool.inputSchema);
      const required = Array.isArray(inputSchema?.required)
        ? inputSchema.required.filter((entry): entry is string => typeof entry === 'string')
        : [];

      return {
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description : '',
        category: typeof metadata?.category === 'string' ? metadata.category : 'uncategorized',
        requiredArgs: required,
        constrainedArgs: countConstrainedArguments(inputSchema),
      };
    })
    .filter((tool): tool is McpToolSurface => Boolean(tool));
}

function extractResources(payload: unknown[]): McpResourceSurface[] {
  return payload
    .map((rawResource) => {
      const resource = asRecord(rawResource);
      if (!resource) return null;
      const uri = typeof resource.uri === 'string' ? resource.uri : '';
      const name = typeof resource.name === 'string' ? resource.name : uri || 'unnamed resource';
      return {
        uri,
        name,
        description: typeof resource.description === 'string' ? resource.description : '',
      };
    })
    .filter((resource): resource is McpResourceSurface => Boolean(resource));
}

function extractPrompts(payload: unknown[]): McpPromptSurface[] {
  return payload
    .map((rawPrompt) => {
      const prompt = asRecord(rawPrompt);
      if (!prompt || typeof prompt.name !== 'string') return null;
      const args = Array.isArray(prompt.arguments) ? prompt.arguments : [];
      return {
        name: prompt.name,
        description: typeof prompt.description === 'string' ? prompt.description : '',
        argumentCount: args.length,
      };
    })
    .filter((prompt): prompt is McpPromptSurface => Boolean(prompt));
}

async function listSurface(
  token: string,
  method: 'resources/list' | 'prompts/list',
  key: 'resources' | 'prompts',
  sessionId: string,
  id: number,
): Promise<{ items: unknown[]; error: string }> {
  try {
    const listed = await mcpCall<unknown>({
      method,
      params: {},
      sessionId: sessionId || undefined,
      id,
    }, token);
    return {
      items: extractArray(listed.body, key),
      error: '',
    };
  } catch (error) {
    return { items: [], error: toErrorMessage(error) };
  }
}

function buildGuardrails(
  tools: McpToolSurface[],
  capabilities: string[],
  resources: McpResourceSurface[],
  prompts: McpPromptSurface[],
): string[] {
  const requiredCount = tools.filter((tool) => tool.requiredArgs.length > 0).length;
  const constrainedCount = tools.filter((tool) => tool.constrainedArgs > 0).length;
  const guardrails: string[] = [];

  if (requiredCount > 0) {
    guardrails.push(`${requiredCount}/${tools.length} tools enforce required arguments.`);
  }
  if (constrainedCount > 0) {
    guardrails.push(`${constrainedCount}/${tools.length} tools declare schema constraints (min/max/enum/pattern).`);
  }
  if (capabilities.length > 0) {
    guardrails.push(`Server advertises ${capabilities.length} capability surface(s).`);
  }
  if (resources.length === 0) {
    guardrails.push('Resource catalog is empty or unavailable.');
  }
  if (prompts.length === 0) {
    guardrails.push('Prompt catalog is empty or unavailable.');
  }

  return guardrails.length > 0 ? guardrails : ['No explicit protocol guardrail metadata was discovered.'];
}

export async function verifyMcpRuntimeReadiness(token: string): Promise<McpRuntimeReadinessResult> {
  const initialized = await mcpCall<unknown>({
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'courtlistener-spa-onboarding', version: '1.0.0' },
    },
    id: 90_001,
  }, token);

  const listedTools = await mcpCall<unknown>({
    method: 'tools/list',
    params: {},
    sessionId: initialized.sessionId ?? undefined,
    id: 90_002,
  }, token);

  const sessionId = listedTools.sessionId ?? initialized.sessionId ?? '';
  const resourcesResult = await listSurface(token, 'resources/list', 'resources', sessionId, 90_003);
  const promptsResult = await listSurface(token, 'prompts/list', 'prompts', sessionId, 90_004);
  const tools = extractTools(listedTools.body);
  const resources = extractResources(resourcesResult.items);
  const prompts = extractPrompts(promptsResult.items);
  const capabilities = extractCapabilities(initialized.body);
  const diagnostics = [
    resourcesResult.error ? `Resources discovery unavailable: ${resourcesResult.error}` : '',
    promptsResult.error ? `Prompts discovery unavailable: ${promptsResult.error}` : '',
    sessionId ? '' : 'MCP transport did not return a session id; each call may renegotiate protocol state.',
  ].filter(Boolean);
  const serverInfo = extractServerInfo(initialized.body);

  return {
    ready: true,
    sessionId,
    toolCount: tools.length,
    resourceCount: resources.length,
    promptCount: prompts.length,
    protocolVersion: extractProtocolVersion(initialized.body),
    serverName: serverInfo.name,
    serverVersion: serverInfo.version,
    capabilities,
    toolCategories: extractToolCategories(listedTools.body),
    tools,
    resources,
    prompts,
    guardrails: buildGuardrails(tools, capabilities, resources, prompts),
    diagnostics,
  };
}
