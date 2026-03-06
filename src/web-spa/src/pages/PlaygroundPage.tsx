import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { mcpCall, aiChat, aiPlain, toErrorMessage } from '../lib/api';
import { markFirstMcpSuccess, trackEvent } from '../lib/telemetry';
import { useToken } from '../lib/token-context';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStatus } from '../hooks/useStatus';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { useRateLimitBackoff } from '../hooks/useRateLimitBackoff';
import { PlaygroundProvider, usePlayground } from '../lib/playground-context';
import type { TranscriptItem } from '../lib/playground-context';
import { consumeOperationalStatus, rememberOperationalStatus, shouldCarryOperationalStatus, withRecoveryHint } from '../lib/operational-status';
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';

/** Extract a human-readable message from any rejection reason (Error, ApiError, or unknown). */
function reasonMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === 'object') {
    const r = reason as Record<string, unknown>;
    if (typeof r.message === 'string' && r.message) return r.message;
    if (typeof r.error === 'string' && r.error) return r.error;
  }
  return 'Request failed — please try again.';
}

// ─── Tool Catalog ────────────────────────────────────────────────

interface ToolInfo {
  name: string;
  description: string;
  category: string;
  argHint: string;
  inputSchema?: Record<string, unknown>;
}

interface ToolCategoryGroup {
  category: string;
  tools: ToolInfo[];
}

type SchemaValueType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'unknown';

interface SchemaField {
  name: string;
  type: SchemaValueType;
  required: boolean;
  description: string;
}

const TOOL_CATALOG: ToolInfo[] = [
  // Search
  { name: 'search_cases', description: 'Search for court cases by query, citation, judge, or date', category: 'Search', argHint: 'query' },
  { name: 'search_opinions', description: 'Search for judicial opinions by topic or keyword', category: 'Search', argHint: 'query' },
  { name: 'advanced_search', description: 'Advanced multi-field search across all data', category: 'Search', argHint: 'query' },
  // Cases
  { name: 'get_case_details', description: 'Get full details for a specific case by cluster ID', category: 'Cases', argHint: 'cluster_id' },
  { name: 'get_related_cases', description: 'Find cases related to a given case', category: 'Cases', argHint: 'cluster_id' },
  { name: 'analyze_case_authorities', description: 'Analyze citing and cited authorities for a case', category: 'Cases', argHint: 'cluster_id' },
  // Opinions
  { name: 'get_opinion_text', description: 'Retrieve the full text of an opinion', category: 'Opinions', argHint: 'opinion_id' },
  { name: 'analyze_legal_argument', description: 'Analyze legal arguments and find supporting precedents', category: 'Opinions', argHint: 'argument' },
  { name: 'get_citation_network', description: 'Map how an opinion influenced later decisions', category: 'Opinions', argHint: 'opinion_id' },
  { name: 'lookup_citation', description: 'Look up a case by its legal citation (e.g., 410 U.S. 113)', category: 'Opinions', argHint: 'citation' },
  // Courts
  { name: 'list_courts', description: 'List all courts with optional jurisdiction filter', category: 'Courts', argHint: '' },
  { name: 'get_judges', description: 'Search for judges by name or court', category: 'Courts', argHint: 'query' },
  { name: 'get_judge', description: 'Get details for a specific judge by ID', category: 'Courts', argHint: 'judge_id' },
  // Dockets
  { name: 'get_dockets', description: 'Search for dockets by case name or number', category: 'Dockets', argHint: 'query' },
  { name: 'get_docket', description: 'Get a specific docket by ID', category: 'Dockets', argHint: 'docket_id' },
  { name: 'get_docket_entries', description: 'Get filings/entries for a docket', category: 'Dockets', argHint: 'docket_id' },
  { name: 'get_recap_documents', description: 'Search RECAP documents by docket', category: 'Dockets', argHint: 'docket_id' },
  { name: 'get_recap_document', description: 'Get a specific RECAP document', category: 'Dockets', argHint: 'document_id' },
  // Enhanced
  { name: 'get_comprehensive_judge_profile', description: 'Full profile with rulings, disclosures, and patterns', category: 'Enhanced', argHint: 'judge_id' },
  { name: 'get_comprehensive_case_analysis', description: 'Complete case intelligence with citations and analysis', category: 'Enhanced', argHint: 'cluster_id' },
  { name: 'get_financial_disclosure_details', description: 'Judge financial disclosures (investments, gifts)', category: 'Enhanced', argHint: 'judge_id' },
  { name: 'get_enhanced_recap_data', description: 'Enhanced PACER/RECAP document retrieval', category: 'Enhanced', argHint: 'document_id' },
  { name: 'get_visualization_data', description: 'Citation visualization data for graphing', category: 'Enhanced', argHint: 'cluster_id' },
  { name: 'get_bulk_data', description: 'Bulk data downloads from CourtListener', category: 'Enhanced', argHint: 'type' },
  { name: 'get_bankruptcy_data', description: 'Bankruptcy-specific court data', category: 'Enhanced', argHint: 'query' },
  // Miscellaneous
  { name: 'validate_citations', description: 'Check if citations in text are valid', category: 'Misc', argHint: 'text' },
  { name: 'get_financial_disclosures', description: 'Search financial disclosures', category: 'Misc', argHint: 'judge_id' },
  { name: 'get_financial_disclosure', description: 'Get a specific financial disclosure', category: 'Misc', argHint: 'disclosure_id' },
  { name: 'get_parties_and_attorneys', description: 'Get parties and attorneys for a docket', category: 'Misc', argHint: 'docket_id' },
  { name: 'manage_alerts', description: 'Create and manage case alerts', category: 'Misc', argHint: 'action' },
  // Oral Arguments
  { name: 'get_oral_arguments', description: 'Search oral arguments by case or date', category: 'Oral Args', argHint: 'query' },
  { name: 'get_oral_argument', description: 'Get a specific oral argument by ID', category: 'Oral Args', argHint: 'argument_id' },
];

const TOOL_CATALOG_BY_NAME = new Map(TOOL_CATALOG.map((tool) => [tool.name, tool]));
const ASYNC_JOB_STORAGE_KEY = 'clmcp_async_jobs_workspace_v1';
const ASYNC_CONTROL_TOOLS = {
  status: 'mcp_async_get_job',
  result: 'mcp_async_get_job_result',
  cancel: 'mcp_async_cancel_job',
} as const;

type AsyncJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';

interface AsyncJobSnapshot {
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
  cancellationRequested: boolean;
  error?: {
    code: string;
    message: string;
    deadLetter: boolean;
    attempts: number;
    history: string[];
  };
}

interface AsyncJobReplayRequest {
  toolName: string;
  arguments: Record<string, unknown>;
}

interface AsyncTrackedJob {
  job: AsyncJobSnapshot;
  replay?: AsyncJobReplayRequest;
  latestResult?: unknown;
  latestError?: string;
}

interface AsyncEnvelopePayload {
  success: boolean;
  mode?: string;
  job?: AsyncJobSnapshot;
  result?: unknown;
  error?: string;
  deduplicated?: boolean;
}

const ASYNC_STATUS_META: Record<AsyncJobStatus, { label: string; summary: string; tone: 'ok' | 'error' | 'info' }> = {
  queued: { label: 'Queued', summary: 'Waiting for execution slot.', tone: 'info' },
  running: { label: 'Running', summary: 'Actively executing now.', tone: 'info' },
  succeeded: { label: 'Succeeded', summary: 'Completed successfully.', tone: 'ok' },
  failed: { label: 'Failed', summary: 'Execution ended with an error.', tone: 'error' },
  expired: { label: 'Expired', summary: 'TTL elapsed before completion.', tone: 'error' },
};

const TERMINAL_ASYNC_STATUSES = new Set<AsyncJobStatus>(['succeeded', 'failed', 'expired']);

function asyncStatusToneClass(status: AsyncJobStatus): string {
  const tone = ASYNC_STATUS_META[status].tone;
  if (tone === 'ok') return 'async-job-status-pill tone-ok';
  if (tone === 'error') return 'async-job-status-pill tone-error';
  return 'async-job-status-pill tone-info';
}

function parseAsyncJobSnapshot(value: unknown): AsyncJobSnapshot | null {
  const record = asRecord(value);
  if (!record) return null;
  const status = record.status;
  if (
    status !== 'queued' &&
    status !== 'running' &&
    status !== 'succeeded' &&
    status !== 'failed' &&
    status !== 'expired'
  ) {
    return null;
  }
  const attempts = asRecord(record.attempts);
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const toolName = typeof record.toolName === 'string' ? record.toolName.trim() : '';
  if (!id || !toolName || !attempts) return null;
  return {
    id,
    status,
    toolName,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : new Date().toISOString(),
    attempts: {
      current: typeof attempts.current === 'number' ? attempts.current : 0,
      max: typeof attempts.max === 'number' ? attempts.max : 1,
    },
    cancellationRequested: record.cancellationRequested === true,
    ...(asRecord(record.error)
      ? {
          error: {
            code: typeof record.error.code === 'string' ? record.error.code : 'execution_failed',
            message: typeof record.error.message === 'string' ? record.error.message : 'Unknown async job error',
            deadLetter: record.error.deadLetter === true,
            attempts: typeof record.error.attempts === 'number' ? record.error.attempts : 0,
            history: Array.isArray(record.error.history)
              ? record.error.history.filter((entry): entry is string => typeof entry === 'string')
              : [],
          },
        }
      : {}),
  };
}

function parseAsyncEnvelopeRecord(record: Record<string, unknown>): AsyncEnvelopePayload | null {
  const snapshot = parseAsyncJobSnapshot(record.job);
  const mode = typeof record.mode === 'string' ? record.mode : undefined;
  if (mode !== 'async' && !snapshot) return null;
  return {
    success: record.success !== false,
    ...(mode ? { mode } : {}),
    ...(snapshot ? { job: snapshot } : {}),
    ...('result' in record ? { result: record.result } : {}),
    ...(typeof record.error === 'string' ? { error: record.error } : {}),
    ...(typeof record.deduplicated === 'boolean' ? { deduplicated: record.deduplicated } : {}),
  };
}

function parseAsyncEnvelopePayload(body: unknown): AsyncEnvelopePayload | null {
  const root = asRecord(body);
  if (!root) return null;
  const rootResult = asRecord(root.result);
  const directCandidates = [
    root,
    asRecord(root.structuredContent),
    rootResult,
    asRecord(rootResult?.structuredContent),
  ];
  for (const candidate of directCandidates) {
    if (!candidate) continue;
    const parsed = parseAsyncEnvelopeRecord(candidate);
    if (parsed) return parsed;
  }

  const contentCandidates = [root, rootResult];
  for (const candidate of contentCandidates) {
    const content = candidate?.content;
    if (!Array.isArray(content)) continue;
    for (const chunk of content) {
      const part = asRecord(chunk);
      if (part?.type !== 'text' || typeof part.text !== 'string') continue;
      try {
        const parsedText = parseAsyncEnvelopeRecord(asRecord(JSON.parse(part.text)) ?? {});
        if (parsedText) return parsedText;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function restoreTrackedJobs(): Record<string, AsyncTrackedJob> {
  if (
    typeof localStorage === 'undefined' ||
    !localStorage ||
    typeof localStorage.getItem !== 'function'
  ) {
    return {};
  }
  try {
    const stored = JSON.parse(localStorage.getItem(ASYNC_JOB_STORAGE_KEY) || '{}');
    const record = asRecord(stored);
    if (!record) return {};
    const jobs: Record<string, AsyncTrackedJob> = {};
    for (const [jobId, value] of Object.entries(record)) {
      const entry = asRecord(value);
      const job = parseAsyncJobSnapshot(entry?.job);
      if (!job || job.id !== jobId) continue;
      const replay = asRecord(entry?.replay);
      const replayArgs = asRecord(replay?.arguments);
      jobs[jobId] = {
        job,
        ...(replay && typeof replay.toolName === 'string' && replayArgs
          ? { replay: { toolName: replay.toolName, arguments: replayArgs } }
          : {}),
        ...('latestResult' in (entry ?? {}) ? { latestResult: entry?.latestResult } : {}),
        ...(typeof entry?.latestError === 'string' ? { latestError: entry.latestError } : {}),
      };
    }
    return jobs;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeCategory(category: string): string {
  const spaced = category.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return 'Other';
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferCategoryFromName(toolName: string, categories: string[]): string {
  const lower = toolName.toLowerCase();
  if (lower.includes('oral_argument')) return 'Oral Args';
  if (lower.startsWith('search_') || lower.includes('search')) return 'Search';
  if (lower.includes('citation') || lower.includes('opinion')) return 'Opinions';
  if (lower.includes('court') || lower.includes('judge')) return 'Courts';
  if (lower.includes('docket') || lower.includes('recap') || lower.includes('parties')) return 'Dockets';
  if (lower.includes('case')) return 'Cases';
  if (lower.includes('enhanced') || lower.includes('comprehensive') || lower.includes('visualization') || lower.includes('bulk')) return 'Enhanced';
  const metadataCategory = categories.find((category) =>
    lower.includes(category.toLowerCase().replace(/\s+/g, '_')),
  );
  return metadataCategory ? normalizeCategory(metadataCategory) : 'Other';
}

function inferArgHint(inputSchema: unknown, fallback = ''): string {
  const schema = asRecord(inputSchema);
  if (!schema) return fallback;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  if (required.length > 0) return required[0]!;
  const properties = asRecord(schema.properties);
  if (!properties) return fallback;
  const propNames = Object.keys(properties);
  if (propNames.length === 0) return fallback;
  const preferred = ['query', 'citation', 'text', 'argument', 'cluster_id', 'opinion_id', 'judge_id', 'docket_id', 'document_id', 'disclosure_id', 'argument_id']
    .find((key) => propNames.includes(key));
  return preferred ?? propNames[0] ?? fallback;
}

function toSchemaType(property: Record<string, unknown>): SchemaValueType {
  const rawType = property.type;
  const normalized = typeof rawType === 'string'
    ? rawType
    : Array.isArray(rawType)
      ? rawType.find((entry): entry is string => typeof entry === 'string')
      : undefined;
  if (!normalized) return 'unknown';
  if (normalized === 'string' || normalized === 'number' || normalized === 'integer' || normalized === 'boolean' || normalized === 'array' || normalized === 'object') {
    return normalized;
  }
  return 'unknown';
}

function schemaFieldsForTool(tool: ToolInfo | undefined): SchemaField[] {
  const schema = asRecord(tool?.inputSchema);
  const properties = asRecord(schema?.properties);
  if (!properties) return [];
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((value): value is string => typeof value === 'string')
      : [],
  );
  return Object.entries(properties)
    .map(([name, entry]) => {
      const property = asRecord(entry);
      return {
        name,
        type: property ? toSchemaType(property) : 'unknown',
        required: required.has(name),
        description: typeof property?.description === 'string' ? property.description : '',
      };
    })
    .sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name));
}

function initialSchemaValues(tool: ToolInfo | undefined, fields: SchemaField[]): Record<string, string | boolean> {
  const schema = asRecord(tool?.inputSchema);
  const properties = asRecord(schema?.properties);
  if (!properties) return {};
  const values: Record<string, string | boolean> = {};
  for (const field of fields) {
    const property = asRecord(properties[field.name]);
    const fallback = field.type === 'boolean' ? false : '';
    const defaultValue = property?.default;
    if (typeof defaultValue === 'boolean') {
      values[field.name] = defaultValue;
    } else if (typeof defaultValue === 'number' || typeof defaultValue === 'string') {
      values[field.name] = String(defaultValue);
    } else if (Array.isArray(defaultValue) || asRecord(defaultValue)) {
      values[field.name] = JSON.stringify(defaultValue);
    } else if (field.required) {
      values[field.name] = fallback;
    }
  }
  return values;
}

function buildArgumentsFromSchema(
  fields: SchemaField[],
  values: Record<string, string | boolean | undefined>,
  enforceRequired: boolean,
): { arguments: Record<string, unknown>; errors: Record<string, string> } {
  const args: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = values[field.name];
    const empty = raw === undefined || (typeof raw === 'string' && raw.trim() === '');
    if (empty) {
      if (field.required && enforceRequired) {
        errors[field.name] = `${field.name} is required.`;
      }
      continue;
    }

    if (field.type === 'boolean') {
      args[field.name] = typeof raw === 'boolean' ? raw : String(raw).toLowerCase() === 'true';
      continue;
    }
    if (field.type === 'string' || field.type === 'unknown') {
      args[field.name] = String(raw);
      continue;
    }
    if (field.type === 'number' || field.type === 'integer') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || (field.type === 'integer' && !Number.isInteger(parsed))) {
        errors[field.name] = `${field.name} must be a ${field.type}.`;
      } else {
        args[field.name] = parsed;
      }
      continue;
    }

    try {
      const parsed = JSON.parse(String(raw));
      if (field.type === 'array' && !Array.isArray(parsed)) {
        errors[field.name] = `${field.name} must be a JSON array.`;
      } else if (field.type === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
        errors[field.name] = `${field.name} must be a JSON object.`;
      } else {
        args[field.name] = parsed;
      }
    } catch {
      errors[field.name] = `${field.name} must be valid JSON (${field.type}).`;
    }
  }
  return { arguments: args, errors };
}

function normalizeDiscoveredTools(body: unknown): ToolInfo[] {
  const envelope = asRecord(body);
  const payload = asRecord(envelope?.result) ?? envelope;
  if (!payload) return [];
  const tools = Array.isArray(payload.tools) ? payload.tools : [];
  const metadata = asRecord(payload.metadata);
  const metadataCategories = Array.isArray(metadata?.categories)
    ? metadata.categories.filter((category): category is string => typeof category === 'string')
    : [];

  const discovered = new Map<string, ToolInfo>();
  for (const entry of tools) {
    const tool = asRecord(entry);
    const name = typeof tool?.name === 'string' ? tool.name.trim() : '';
    if (!name || discovered.has(name)) continue;
    const fallback = TOOL_CATALOG_BY_NAME.get(name);
    const entryMetadata = asRecord(tool?.metadata);
    const category =
      (typeof entryMetadata?.category === 'string' && normalizeCategory(entryMetadata.category)) ||
      (typeof tool?.category === 'string' && normalizeCategory(tool.category)) ||
      fallback?.category ||
      inferCategoryFromName(name, metadataCategories);
    const description = typeof tool?.description === 'string' && tool.description.trim()
      ? tool.description
      : (fallback?.description ?? 'No description available.');
    discovered.set(name, {
      name,
      description,
      category,
      argHint: inferArgHint(tool?.inputSchema, fallback?.argHint ?? ''),
      inputSchema: asRecord(tool?.inputSchema) ?? undefined,
    });
  }
  return Array.from(discovered.values());
}

function groupToolsByCategory(tools: ToolInfo[]): ToolCategoryGroup[] {
  const grouped = new Map<string, ToolInfo[]>();
  for (const tool of tools) {
    const existing = grouped.get(tool.category);
    if (existing) existing.push(tool);
    else grouped.set(tool.category, [tool]);
  }
  return Array.from(grouped.entries()).map(([category, categoryTools]) => ({ category, tools: categoryTools }));
}

// ─── Tool Select Dropdown (shared) ──────────────────────────────

const ToolSelect = React.memo(function ToolSelect({ value, onChange, includeAuto, tools }: {
  value: string;
  onChange: (v: string) => void;
  includeAuto?: boolean;
  tools: ToolInfo[];
}): React.JSX.Element {
  const groupedTools = React.useMemo(() => groupToolsByCategory(tools), [tools]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {includeAuto && <option value="auto">🤖 auto (AI selects best tool)</option>}
      {groupedTools.map((group) => (
        <optgroup key={group.category} label={group.category}>
          {group.tools.map((t) => (
            <option key={t.name} value={t.name} title={t.description}>
              {t.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
});

// ─── Simple Markdown Renderer ───────────────────────────────────

function renderMarkdown(text: string): React.JSX.Element {
  const lines = text.split('\n');
  const elements: React.JSX.Element[] = [];
  let listItems: string[] = [];

  function flushList(): void {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`}>
          {listItems.map((li, i) => <li key={i}>{inlineFormat(li)}</li>)}
        </ul>,
      );
      listItems = [];
    }
  }

  function inlineFormat(s: string): React.ReactNode {
    // Bold: **text** or __text__
    const parts = s.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
    return parts.map((part, i) => {
      if (/^\*\*(.+)\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (/^__(.+)__$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
      return part;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('### ')) {
      flushList();
      elements.push(<h4 key={i} className="md-heading md-heading-sm">{inlineFormat(line.slice(4))}</h4>);
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={i} className="md-heading md-heading-md">{inlineFormat(line.slice(3))}</h3>);
    } else if (line.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={i} className="md-heading md-heading-lg">{inlineFormat(line.slice(2))}</h2>);
    } else if (/^[-*]\s/.test(line)) {
      listItems.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s/, ''));
    } else {
      flushList();
      if (line.trim()) {
        elements.push(<p key={i} className="md-paragraph">{inlineFormat(line)}</p>);
      }
    }
  }
  flushList();
  return <>{elements}</>;
}

// ─── Preset Definitions ─────────────────────────────────────────

interface Preset {
  label: string;
  icon: string;
  toolName: string;
  prompt: string;
}

const AI_PRESETS: Preset[] = [
  { label: 'Case Search', icon: '🔍', toolName: 'search_cases', prompt: 'Find appellate cases discussing qualified immunity for police and summarize key trends.' },
  { label: 'Citation Lookup', icon: '📖', toolName: 'lookup_citation', prompt: '410 U.S. 113' },
  { label: 'Opinion Analysis', icon: '⚖️', toolName: 'search_opinions', prompt: 'Recent appellate opinions about Fourth Amendment digital privacy protections' },
  { label: 'Legal Argument', icon: '📝', toolName: 'analyze_legal_argument', prompt: 'The First Amendment protects student speech in public schools unless it causes substantial disruption' },
  { label: 'Court Explorer', icon: '🏛️', toolName: 'list_courts', prompt: 'List all federal courts' },
  { label: 'Citation Validator', icon: '✓', toolName: 'validate_citations', prompt: 'The court in Roe v. Wade, 410 U.S. 113 (1973), held that Miranda v. Arizona, 384 U.S. 436 (1966) applies.' },
];
const RECENT_PROMPTS_KEY = 'clmcp_recent_ai_prompts';

// ─── Tool Catalog Panel ─────────────────────────────────────────

const ToolCatalogPanel = React.memo(function ToolCatalogPanel({ tools }: { tools: ToolInfo[] }): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(false);
  const groupedTools = React.useMemo(() => groupToolsByCategory(tools), [tools]);
  return (
    <Card title={`Available MCP Tools (${tools.length})`} subtitle="All tools accessible through the Model Context Protocol.">
      <Button variant="secondary" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Hide catalog' : 'Show all tools'}
      </Button>
      {expanded && (
        <div className="tool-catalog-wrap">
          {groupedTools.map((group) => (
            <div key={group.category} className="tool-catalog-group">
              <h4 className="tool-catalog-heading">{group.category}</h4>
              <div className="tool-catalog-grid">
                {group.tools.map((t) => (
                  <div key={t.name} className="tool-catalog-item">
                    <code className="tool-catalog-name">{t.name}</code>
                    <span className="tool-catalog-description">{t.description}</span>
                    {t.argHint && <span className="tool-catalog-hint">({t.argHint})</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
});

// ─── Session Badge ──────────────────────────────────────────────

function SessionBadge({ toolCount }: { toolCount: number }): React.JSX.Element {
  const { mcpSessionId } = usePlayground();
  const connected = mcpSessionId.length > 0;
  return (
    <div className={`session-badge ${connected ? 'connected' : ''}`.trim()}>
      <span className="session-badge-dot" />
      {connected ? `Session: ${mcpSessionId.slice(0, 8)}…` : 'No session'}
      {connected && <span className="session-badge-tools">| {toolCount} tools</span>}
    </div>
  );
}

// ─── Raw MCP Panel ───────────────────────────────────────────────

function RawMcpPanel({ tools }: { tools: ToolInfo[] }): React.JSX.Element {
  const { token, tokenMissing, mcpSessionId, setMcpSessionId, append, addProtocolEntry } = usePlayground();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [toolName, setToolName] = React.useState(() => tools[0]?.name ?? '');
  const [argsMode, setArgsMode] = React.useState<'schema' | 'json'>('schema');
  const [schemaValues, setSchemaValues] = React.useState<Record<string, string | boolean>>({});
  const [schemaErrors, setSchemaErrors] = React.useState<Record<string, string>>({});
  const [rawArguments, setRawArguments] = React.useState('{}');
  const [runAsAsyncJob, setRunAsAsyncJob] = React.useState(false);
  const [trackedJobs, setTrackedJobs] = React.useState<Record<string, AsyncTrackedJob>>(() => restoreTrackedJobs());
  const initialDeepLinkJobId = searchParams.get('jobId')?.trim() ?? '';
  const [selectedJobId, setSelectedJobId] = React.useState(initialDeepLinkJobId);
  const [jobLookupId, setJobLookupId] = React.useState(initialDeepLinkJobId);
  const connectStatus = useStatus();
  const chatStatus = useStatus();
  const operatorStatus = useStatus();
  const operatorBackoff = useRateLimitBackoff();
  const [rpcId, setRpcId] = React.useState(1);
  const [connecting, setConnecting] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const elapsed = useElapsedTimer(sending);
  const cancelledRef = React.useRef(false);
  const selectedTool = React.useMemo(() => tools.find((tool) => tool.name === toolName), [toolName, tools]);
  const schemaFields = React.useMemo(() => schemaFieldsForTool(selectedTool), [selectedTool]);
  const hasSchemaFields = schemaFields.length > 0;
  const selectedTrackedJob = selectedJobId ? trackedJobs[selectedJobId] : undefined;
  const trackedJobList = React.useMemo(
    () =>
      Object.values(trackedJobs).sort(
        (left, right) =>
          new Date(right.job.updatedAt).getTime() - new Date(left.job.updatedAt).getTime(),
      ),
    [trackedJobs],
  );

  React.useEffect(() => {
    return () => { cancelledRef.current = true; };
  }, []);

  React.useEffect(() => {
    if (
      typeof localStorage !== 'undefined' &&
      localStorage &&
      typeof localStorage.setItem === 'function'
    ) {
      localStorage.setItem(ASYNC_JOB_STORAGE_KEY, JSON.stringify(trackedJobs));
    }
  }, [trackedJobs]);

  React.useEffect(() => {
    const currentJobId = searchParams.get('jobId')?.trim() ?? '';
    setSelectedJobId(currentJobId);
    setJobLookupId(currentJobId);
  }, [searchParams]);

  React.useEffect(() => {
    if (tools.length === 0) return;
    if (!tools.some((tool) => tool.name === toolName)) {
      setToolName(tools[0]!.name);
    }
  }, [toolName, tools]);

  React.useEffect(() => {
    const nextValues = initialSchemaValues(selectedTool, schemaFields);
    setSchemaValues(nextValues);
    setSchemaErrors({});
    if (hasSchemaFields) {
      setArgsMode('schema');
      const preview = buildArgumentsFromSchema(schemaFields, nextValues, false).arguments;
      setRawArguments(JSON.stringify(preview, null, 2));
    } else {
      setArgsMode('json');
      setRawArguments('{}');
    }
  }, [hasSchemaFields, schemaFields, selectedTool]);

  function setDeepLinkedJob(jobId: string | null): void {
    const next = new URLSearchParams(searchParams);
    if (jobId && jobId.trim()) {
      next.set('jobId', jobId.trim());
      setSelectedJobId(jobId.trim());
      setJobLookupId(jobId.trim());
    } else {
      next.delete('jobId');
      setSelectedJobId('');
      setJobLookupId('');
    }
    setSearchParams(next);
  }

  function upsertTrackedJob(
    snapshot: AsyncJobSnapshot,
    options: {
      replay?: AsyncJobReplayRequest;
      latestResult?: unknown;
      latestError?: string;
      clearResult?: boolean;
      clearError?: boolean;
    } = {},
  ): void {
    setTrackedJobs((existing) => {
      const previous = existing[snapshot.id];
      const next: AsyncTrackedJob = {
        job: snapshot,
        ...(options.replay ? { replay: options.replay } : previous?.replay ? { replay: previous.replay } : {}),
        ...(options.clearResult ? {} : 'latestResult' in options ? { latestResult: options.latestResult } : previous && 'latestResult' in previous ? { latestResult: previous.latestResult } : {}),
        ...(options.clearError ? {} : typeof options.latestError === 'string' ? { latestError: options.latestError } : previous?.latestError ? { latestError: previous.latestError } : {}),
      };
      return { ...existing, [snapshot.id]: next };
    });
  }

  function reportOperatorError(error: unknown, fallbackMessage: string): void {
    const message = withRecoveryHint(error, fallbackMessage);
    operatorStatus.setError(message);
    operatorBackoff.trigger(error);
    if (shouldCarryOperationalStatus(error, message)) {
      rememberOperationalStatus(message, 'info');
    }
  }

  async function callAsyncControl(
    controlTool: (typeof ASYNC_CONTROL_TOOLS)[keyof typeof ASYNC_CONTROL_TOOLS],
    jobId: string,
  ): Promise<AsyncEnvelopePayload | null> {
    if (!mcpSessionId) {
      operatorStatus.setError('Connect MCP session first.');
      return null;
    }
    if (!token.trim()) {
      operatorStatus.setError('Load a local MCP credential first.');
      return null;
    }
    const nextId = rpcId;
    setRpcId((value) => value + 1);
    const reqPayload = {
      method: 'tools/call',
      params: {
        name: controlTool,
        arguments: { jobId },
      },
      sessionId: mcpSessionId,
      id: nextId,
    };
    addProtocolEntry('request', reqPayload);
    const result = await mcpCall<unknown>(reqPayload, token);
    if (cancelledRef.current) return null;
    addProtocolEntry('response', result.body);
    return parseAsyncEnvelopePayload(result.body);
  }

  async function refreshAsyncJob(jobId: string, silent = false): Promise<void> {
    try {
      const payload = await callAsyncControl(ASYNC_CONTROL_TOOLS.status, jobId);
      if (!payload?.job) {
        if (!silent) operatorStatus.setError('Job status payload was not returned by the MCP server. Retry status or reconnect session.');
        return;
      }
      const latestError = payload.error ?? payload.job.error?.message;
      upsertTrackedJob(payload.job, {
        latestError,
        ...(payload.job.status === 'queued' || payload.job.status === 'running' || payload.job.status === 'succeeded'
          ? { clearError: true }
          : {}),
      });
      if (!silent) {
        const stateMessage = `Job ${payload.job.id} is ${payload.job.status}.`;
        if (payload.job.status === 'failed' || payload.job.status === 'expired') {
          operatorStatus.setError(latestError ?? `${stateMessage} Review error details and retry if needed.`);
        } else if (payload.job.status === 'succeeded') {
          operatorStatus.setOk(stateMessage);
        } else {
          operatorStatus.setInfo(stateMessage);
        }
      }
    } catch (error) {
      if (cancelledRef.current) return;
      reportOperatorError(error, toErrorMessage(error));
    }
  }

  async function fetchAsyncResult(jobId: string): Promise<void> {
    operatorStatus.setInfo('Retrieving async job result...');
    try {
      const payload = await callAsyncControl(ASYNC_CONTROL_TOOLS.result, jobId);
      if (!payload?.job) {
        operatorStatus.setError('Result payload was not returned by the MCP server. Refresh status, then retry result retrieval.');
        return;
      }
      upsertTrackedJob(payload.job, {
        latestResult: payload.result,
        latestError: payload.error ?? payload.job.error?.message,
        ...(payload.success ? { clearError: true } : {}),
      });
      if (payload.success) {
        operatorStatus.setOk(`Result retrieved for ${payload.job.id}.`);
      } else {
        operatorStatus.setError(payload.error ?? payload.job.error?.message ?? 'Async result request failed.');
      }
    } catch (error) {
      if (cancelledRef.current) return;
      reportOperatorError(error, toErrorMessage(error));
    }
  }

  async function cancelAsyncJob(jobId: string): Promise<void> {
    operatorStatus.setInfo('Requesting job cancellation...');
    try {
      const payload = await callAsyncControl(ASYNC_CONTROL_TOOLS.cancel, jobId);
      if (!payload?.job) {
        operatorStatus.setError('Cancel payload was not returned by the MCP server. Retry cancellation or refresh status.');
        return;
      }
      upsertTrackedJob(payload.job, {
        latestError: payload.error ?? payload.job.error?.message,
      });
      if (payload.success) operatorStatus.setOk(`Cancellation processed for ${payload.job.id}.`);
      else operatorStatus.setError(payload.error ?? payload.job.error?.message ?? `Cancellation failed for ${payload.job.id}.`);
    } catch (error) {
      if (cancelledRef.current) return;
      reportOperatorError(error, toErrorMessage(error));
    }
  }

  async function retryAsyncJob(jobId: string): Promise<void> {
    const replay = trackedJobs[jobId]?.replay;
    if (!replay) {
      operatorStatus.setError('Retry is unavailable for this job (original request not cached in this browser).');
      return;
    }
    if (!mcpSessionId) {
      operatorStatus.setError('Connect MCP session first.');
      return;
    }
    if (!token.trim()) {
      operatorStatus.setError('Load a local MCP credential first.');
      return;
    }
    operatorStatus.setInfo(`Retrying ${replay.toolName} as a new async job...`);
    try {
      const nextId = rpcId;
      setRpcId((value) => value + 1);
      const reqPayload = {
        method: 'tools/call',
        params: {
          name: replay.toolName,
          arguments: {
            ...replay.arguments,
            __mcp_async: {
              mode: 'async',
            },
          },
        },
        sessionId: mcpSessionId,
        id: nextId,
      };
      addProtocolEntry('request', reqPayload);
      const result = await mcpCall<unknown>(reqPayload, token);
      if (cancelledRef.current) return;
      addProtocolEntry('response', result.body);
      const asyncPayload = parseAsyncEnvelopePayload(result.body);
      if (!asyncPayload?.job) {
        operatorStatus.setError('Retry response did not include async job details.');
        return;
      }
      upsertTrackedJob(asyncPayload.job, {
        replay,
        clearResult: true,
        clearError: true,
      });
      setDeepLinkedJob(asyncPayload.job.id);
      operatorStatus.setOk(`Retry queued as job ${asyncPayload.job.id}.`);
    } catch (error) {
      if (cancelledRef.current) return;
      reportOperatorError(error, toErrorMessage(error));
    }
  }

  React.useEffect(() => {
    if (!selectedJobId || trackedJobs[selectedJobId] || !mcpSessionId || !token.trim()) return;
    void refreshAsyncJob(selectedJobId);
  }, [mcpSessionId, selectedJobId, token, trackedJobs]);

  React.useEffect(() => {
    if (!selectedTrackedJob) return;
    if (TERMINAL_ASYNC_STATUSES.has(selectedTrackedJob.job.status)) return;
    const poller = setInterval(() => {
      void refreshAsyncJob(selectedTrackedJob.job.id, true);
    }, 3000);
    return () => clearInterval(poller);
  }, [selectedTrackedJob]);

  useKeyboardShortcut('Enter', () => { void sendRaw(); }, { disabled: sending || tokenMissing });

  async function connect(): Promise<void> {
    if (!token.trim()) {
      connectStatus.setError('Load a local MCP credential first (Operator Session page).');
      return;
    }
    setConnecting(true);
    connectStatus.setInfo('Connecting...');
    try {
      const nextId = rpcId;
      setRpcId((v) => v + 1);
      const reqPayload = {
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'courtlistener-spa-console', version: '1.0.0' },
        },
        sessionId: mcpSessionId || undefined,
        id: nextId,
      };
      addProtocolEntry('request', reqPayload);
      const result = await mcpCall<unknown>(reqPayload, token);
      if (cancelledRef.current) return;
      addProtocolEntry('response', result.body);
      if (result.sessionId) setMcpSessionId(result.sessionId);
      append('system', '✅ MCP session initialized');
      append('system', JSON.stringify(result.body));
      connectStatus.setOk(`Connected. Session: ${result.sessionId ?? mcpSessionId ?? 'none'}`);
      toast('MCP session connected', 'ok');
    } catch (error) {
      if (cancelledRef.current) return;
      const message = withRecoveryHint(error, toErrorMessage(error));
      connectStatus.setError(message);
      append('error', message);
      if (shouldCarryOperationalStatus(error, message)) {
        rememberOperationalStatus(message, 'info');
      }
    } finally {
      if (!cancelledRef.current) setConnecting(false);
    }
  }

  async function sendRaw(): Promise<void> {
    if (!mcpSessionId) { chatStatus.setError('Connect MCP session first.'); return; }
    if (!toolName) { chatStatus.setError('No tool available.'); return; }

    let args: Record<string, unknown>;
    if (argsMode === 'json' || !hasSchemaFields) {
      try {
        const parsed = JSON.parse(rawArguments || '{}');
        const asObj = asRecord(parsed);
        if (!asObj) {
          chatStatus.setError('Arguments must be a JSON object.');
          return;
        }
        args = asObj;
      } catch {
        chatStatus.setError('Arguments must be valid JSON.');
        return;
      }
      setSchemaErrors({});
    } else {
      const validation = buildArgumentsFromSchema(schemaFields, schemaValues, true);
      setSchemaErrors(validation.errors);
      if (Object.keys(validation.errors).length > 0) {
        chatStatus.setError('Fix argument errors before sending.');
        return;
      }
      args = validation.arguments;
    }

    setSending(true);
    chatStatus.setInfo(`Calling ${toolName}...`);
    append('user', `${toolName} ${JSON.stringify(args)}`);
    try {
      const nextId = rpcId;
      setRpcId((v) => v + 1);
      const reqPayload = {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: runAsAsyncJob
            ? {
                ...args,
                __mcp_async: {
                  mode: 'async',
                },
              }
            : args,
        },
        sessionId: mcpSessionId,
        id: nextId,
      };
      addProtocolEntry('request', reqPayload);
      const started = performance.now();
      const result = await mcpCall<unknown>(reqPayload, token);
      if (cancelledRef.current) return;
      addProtocolEntry('response', result.body);
      const latencyMs = Math.round(performance.now() - started);
      const asyncPayload = parseAsyncEnvelopePayload(result.body);
      if (asyncPayload?.job) {
        upsertTrackedJob(asyncPayload.job, {
          replay: { toolName, arguments: args },
          ...(typeof asyncPayload.error === 'string'
            ? { latestError: asyncPayload.error }
            : asyncPayload.job.error?.message
              ? { latestError: asyncPayload.job.error.message }
              : {}),
          ...(asyncPayload.result !== undefined ? { latestResult: asyncPayload.result } : {}),
          ...(asyncPayload.success ? { clearError: true } : {}),
        });
        setDeepLinkedJob(asyncPayload.job.id);
        append('assistant', JSON.stringify(result.body));
        chatStatus.setOk(`Async job ${asyncPayload.job.id} is ${asyncPayload.job.status}.`);
        operatorStatus.setInfo(`Tracked job ${asyncPayload.job.id} (${asyncPayload.job.status}).`);
      } else {
        append('assistant', JSON.stringify(result.body));
        chatStatus.setOk(`Response received in ${latencyMs}ms.`);
      }
      const duration = markFirstMcpSuccess();
      trackEvent('mcp_tool_call_succeeded', { latency_ms: latencyMs, signup_to_first_ms: duration ?? 0 });
    } catch (error) {
      if (cancelledRef.current) return;
      const message = withRecoveryHint(error, toErrorMessage(error));
      append('error', message);
      chatStatus.setError(message);
      if (shouldCarryOperationalStatus(error, message)) {
        rememberOperationalStatus(message, 'info');
      }
      trackEvent('mcp_tool_call_failed', { category: 'network' });
    } finally {
      if (!cancelledRef.current) setSending(false);
    }
  }

  return (
    <div className="stack">
      <div className="two-col">
        <Card title="Connect MCP session" subtitle="Step 1: initialize a session on /mcp.">
          <div className="row">
            <Button id="connectBtn" disabled={connecting || tokenMissing} onClick={connect}>
              {connecting ? 'Connecting...' : 'Connect MCP Session'}
            </Button>
          </div>
          <StatusBanner id="connectStatus" message={connectStatus.status} type={connectStatus.statusType} />
        </Card>
        <Card title="Tool call" subtitle="Step 2: call a tool inside the active session.">
          <form onSubmit={(e) => { e.preventDefault(); void sendRaw(); }}>
            <FormField id="toolName" label="Tool">
              <ToolSelect value={toolName} onChange={setToolName} tools={tools} />
            </FormField>
            <FormField id="argsMode" label="Arguments mode" hint={hasSchemaFields ? 'Schema form uses tool inputSchema with validation.' : 'Schema unavailable for this tool.'}>
              <div className="row">
                <Button
                  type="button"
                  variant={argsMode === 'schema' ? 'primary' : 'secondary'}
                  disabled={!hasSchemaFields}
                  onClick={() => setArgsMode('schema')}
                >
                  Schema form
                </Button>
                <Button
                  type="button"
                  variant={argsMode === 'json' ? 'primary' : 'secondary'}
                  onClick={() => {
                    const preview = buildArgumentsFromSchema(schemaFields, schemaValues, false).arguments;
                    setRawArguments(JSON.stringify(preview, null, 2));
                    setArgsMode('json');
                  }}
                >
                  Raw JSON
                </Button>
              </div>
            </FormField>
            {argsMode === 'schema' && hasSchemaFields ? (
              <div className="grid-compact">
                {schemaFields.map((field) => (
                  <FormField
                    key={field.name}
                    id={`arg-${field.name}`}
                    label={field.required ? `${field.name} *` : field.name}
                    hint={field.description || `Expected type: ${field.type}`}
                    error={schemaErrors[field.name]}
                  >
                    {field.type === 'boolean' ? (
                      <input
                        id={`arg-${field.name}`}
                        type="checkbox"
                        checked={Boolean(schemaValues[field.name])}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSchemaValues((existing) => ({ ...existing, [field.name]: checked }));
                        }}
                      />
                    ) : field.type === 'array' || field.type === 'object' ? (
                      <textarea
                        id={`arg-${field.name}`}
                        className="mono"
                        rows={3}
                        value={typeof schemaValues[field.name] === 'string' ? schemaValues[field.name] : ''}
                        placeholder={field.type === 'array' ? '[]' : '{}'}
                        onChange={(event) => {
                          const next = event.target.value;
                          setSchemaValues((existing) => ({ ...existing, [field.name]: next }));
                        }}
                      />
                    ) : (
                      <Input
                        id={`arg-${field.name}`}
                        type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                        value={typeof schemaValues[field.name] === 'string' ? schemaValues[field.name] : ''}
                        placeholder={field.description || `Enter ${field.name}`}
                        onChange={(event) => {
                          const next = event.target.value;
                          setSchemaValues((existing) => ({ ...existing, [field.name]: next }));
                        }}
                      />
                    )}
                  </FormField>
                ))}
              </div>
            ) : (
              <FormField id="chatArguments" label="Arguments JSON" hint="Advanced mode: provide a raw JSON object for tool arguments.">
                <textarea
                  id="chatArguments"
                  className="mono"
                  rows={8}
                  value={rawArguments}
                  onChange={(event) => setRawArguments(event.target.value)}
                />
              </FormField>
            )}
            <FormField
              id="asyncToggle"
              label="Execution mode"
              hint="Async mode adds __mcp_async and queues the call in the operator workspace."
            >
              <label className="inline-control">
                <input
                  id="asyncToggle"
                  type="checkbox"
                  checked={runAsAsyncJob}
                  onChange={(event) => setRunAsAsyncJob(event.target.checked)}
                />
                Run as async job
              </label>
            </FormField>
            <Button id="sendBtn" type="submit" disabled={sending || tokenMissing}>
              {sending ? `Sending... (${elapsed}s)` : 'Send'}
            </Button>
            <span className="hint hint-inline">⌘/Ctrl+Enter</span>
            <StatusBanner id="chatStatus" message={chatStatus.status} type={chatStatus.statusType} />
          </form>
        </Card>
      </div>

      <Card
        title="Async jobs operator workspace"
        subtitle="Monitor queued/running/succeeded/failed/expired jobs, cancel running work, retry, and retrieve results."
      >
        <FormField
          id="asyncJobLookup"
          label="Deep-linkable job detail"
          hint="Paste a job ID, or share /app/playground?jobId=<id>."
        >
          <div className="row">
            <Input
              id="asyncJobLookup"
              value={jobLookupId}
              onChange={(event) => setJobLookupId(event.target.value)}
              placeholder="job_abc123..."
            />
            <Button
              type="button"
              variant="secondary"
              disabled={operatorBackoff.blocked}
              onClick={() => {
                const nextJobId = jobLookupId.trim();
                if (!nextJobId) {
                  operatorStatus.setError('Enter a job ID first.');
                  return;
                }
                setDeepLinkedJob(nextJobId);
                void refreshAsyncJob(nextJobId);
              }}
            >
              Open detail
            </Button>
            {selectedJobId && (
              <Button type="button" variant="secondary" onClick={() => setDeepLinkedJob(null)}>
                Clear detail
              </Button>
            )}
          </div>
        </FormField>
        {selectedJobId ? (
          <p className="hint hint-tight">
            Deep link: <code>/app/playground?jobId={selectedJobId}</code>
          </p>
        ) : null}
        <StatusBanner id="asyncOperatorStatus" message={operatorStatus.status} type={operatorStatus.statusType} />
        {operatorBackoff.blocked ? (
          <p className="hint" role="status">
            Rate limited ({operatorBackoff.secondsLeft}s). Wait for the timer, then retry status/cancel/result actions.
          </p>
        ) : null}

        <div className="async-job-list">
          {trackedJobList.length === 0 ? (
            <p className="empty-state">No async jobs tracked yet. Enable async mode and send a tool call.</p>
          ) : (
            trackedJobList.map((entry) => {
              const meta = ASYNC_STATUS_META[entry.job.status];
              return (
                <button
                  key={entry.job.id}
                  type="button"
                  aria-pressed={selectedJobId === entry.job.id}
                  onClick={() => setDeepLinkedJob(entry.job.id)}
                  className={`async-job-item ${selectedJobId === entry.job.id ? 'active' : ''}`.trim()}
                >
                  <div className="async-job-item-header">
                    <strong>{entry.job.id}</strong>
                    <span className="async-job-status-label">{meta.label}</span>
                  </div>
                  <div className="hint">{entry.job.toolName} • attempts {entry.job.attempts.current}/{entry.job.attempts.max}</div>
                </button>
              );
            })
          )}
        </div>

        {selectedJobId ? (
          <div className="async-job-detail">
            <h4 className="async-job-heading">Job detail: {selectedJobId}</h4>
            {selectedTrackedJob ? (
              <>
                <div className="async-job-meta">
                  <span className={asyncStatusToneClass(selectedTrackedJob.job.status)}>
                    {ASYNC_STATUS_META[selectedTrackedJob.job.status].label}
                  </span>
                  <span className="hint">{ASYNC_STATUS_META[selectedTrackedJob.job.status].summary}</span>
                  {selectedTrackedJob.job.cancellationRequested ? <span className="hint">Cancellation requested.</span> : null}
                </div>
                <p className="hint">
                  Created {selectedTrackedJob.job.createdAt} • Updated {selectedTrackedJob.job.updatedAt} • Expires {selectedTrackedJob.job.expiresAt}
                </p>
                <div className="row">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={operatorBackoff.blocked}
                    onClick={() => void refreshAsyncJob(selectedTrackedJob.job.id)}
                  >
                    Refresh status
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={operatorBackoff.blocked}
                    onClick={() => void fetchAsyncResult(selectedTrackedJob.job.id)}
                  >
                    Get result
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      operatorBackoff.blocked ||
                      selectedTrackedJob.job.cancellationRequested ||
                      TERMINAL_ASYNC_STATUSES.has(selectedTrackedJob.job.status)
                    }
                    onClick={() => void cancelAsyncJob(selectedTrackedJob.job.id)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      operatorBackoff.blocked ||
                      !selectedTrackedJob.replay ||
                      !TERMINAL_ASYNC_STATUSES.has(selectedTrackedJob.job.status)
                    }
                    onClick={() => void retryAsyncJob(selectedTrackedJob.job.id)}
                  >
                    Retry
                  </Button>
                </div>
                {(selectedTrackedJob.latestError || selectedTrackedJob.job.error?.message) ? (
                  <pre className="raw-response mono async-job-result">
                    {selectedTrackedJob.latestError ?? selectedTrackedJob.job.error?.message}
                  </pre>
                ) : null}
                {'latestResult' in selectedTrackedJob ? (
                  <pre className="raw-response mono async-job-result">
                    {JSON.stringify(selectedTrackedJob.latestResult, null, 2)}
                  </pre>
                ) : null}
              </>
            ) : (
              <div className="row">
                <p className="hint">No local snapshot yet for this job ID.</p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={operatorBackoff.blocked}
                  onClick={() => void refreshAsyncJob(selectedJobId)}
                >
                  Load status
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

// ─── AI Chat Panel ───────────────────────────────────────────────

interface ChatMessage {
  id: number;
  role: 'user' | 'comparison' | 'system' | 'error';
  prompt?: string;
  mcpResponse?: string;
  plainResponse?: string;
  mcpTool?: string;
  mcpToolReason?: string;
  mcpFallback?: boolean;
  text?: string;
  latencyMs?: number;
}

function AiChatPanel({ tools }: { tools: ToolInfo[] }): React.JSX.Element {
  const { token, tokenMissing, mcpSessionId, setMcpSessionId, setLastRawMcp } = usePlayground();
  const [aiMode, setAiMode] = React.useState<'cheap' | 'balanced'>('cheap');
  const [aiToolName, setAiToolName] = React.useState('auto');
  const [aiPrompt, setAiPrompt] = React.useState('');
  const aiStatus = useStatus();
  const [aiRunning, setAiRunning] = React.useState(false);
  const [step, setStep] = React.useState<string | null>(null);
  const elapsed = useElapsedTimer(aiRunning);
  const cancelledRef = React.useRef(false);
  const [chatHistory, setChatHistory] = React.useState<Array<{ role: string; content: string }>>([]);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [recentPrompts, setRecentPrompts] = React.useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_PROMPTS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, 6) : [];
    } catch {
      return [];
    }
  });
  const [msgId, setMsgId] = React.useState(0);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    return () => { cancelledRef.current = true; };
  }, []);
  React.useEffect(() => {
    if (typeof chatEndRef.current?.scrollIntoView === 'function') {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  React.useEffect(() => {
    if (aiToolName !== 'auto' && !tools.some((tool) => tool.name === aiToolName)) {
      setAiToolName('auto');
    }
  }, [aiToolName, tools]);
  useKeyboardShortcut('Enter', () => { void sendAiChat(); }, { disabled: aiRunning });

  function applyPreset(preset: Preset): void {
    setAiToolName(preset.toolName);
    setAiPrompt(preset.prompt);
  }

  function clearConversation(): void {
    setChatHistory([]);
    setMessages([]);
    setMsgId(0);
    setAiPrompt('');
    aiStatus.setInfo('Conversation cleared.');
  }

  function saveRecentPrompt(prompt: string): void {
    setRecentPrompts((existing) => {
      const next = [prompt, ...existing.filter((entry) => entry !== prompt)].slice(0, 6);
      localStorage.setItem(RECENT_PROMPTS_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function sendAiChat(): Promise<void> {
    if (!aiPrompt.trim()) { aiStatus.setError('Enter a prompt.'); return; }
    const currentPrompt = aiPrompt.trim();
    const currentId = msgId;
    setMsgId((v) => v + 2);
    setAiRunning(true);
    setAiPrompt('');

    // Add user message immediately
    setMessages((prev) => [...prev, { id: currentId, role: 'user', prompt: currentPrompt }]);

    setStep('Sending to both MCP-powered AI and plain AI...');
    try {
      const started = performance.now();
      const [mcpResult, plainResult] = await Promise.allSettled([
        aiChat({
          message: currentPrompt,
          mcpToken: token || undefined,
          mcpSessionId: mcpSessionId || undefined,
          toolName: aiToolName,
          mode: aiMode,
          history: chatHistory,
        }),
        aiPlain({ message: currentPrompt, mode: aiMode, history: chatHistory }),
      ]);
      if (cancelledRef.current) return;
      const latencyMs = Math.round(performance.now() - started);

      const mcpText = mcpResult.status === 'fulfilled' ? mcpResult.value.ai_response : `Error: ${reasonMessage(mcpResult.reason)}`;
      const plainText = plainResult.status === 'fulfilled' ? plainResult.value.ai_response : `Error: ${reasonMessage(plainResult.reason)}`;
      const mcpTool = mcpResult.status === 'fulfilled' ? mcpResult.value.tool : undefined;
      const mcpToolReason = mcpResult.status === 'fulfilled' ? mcpResult.value.tool_reason : undefined;
      const mcpFallback = mcpResult.status === 'fulfilled' ? mcpResult.value.fallback_used : undefined;

      if (mcpResult.status === 'fulfilled') {
        if (mcpResult.value.session_id) setMcpSessionId(mcpResult.value.session_id);
        setLastRawMcp(JSON.stringify(mcpResult.value.mcp_result, null, 2));
      }

      // Add comparison message
      setMessages((prev) => [...prev, {
        id: currentId + 1,
        role: 'comparison',
        mcpResponse: mcpText,
        plainResponse: plainText,
        mcpTool,
        mcpToolReason,
        mcpFallback,
        latencyMs,
      }]);

      // Track conversation for multi-turn
      setChatHistory((prev) => [
        ...prev,
        { role: 'user', content: currentPrompt },
        { role: 'assistant', content: mcpText },
      ]);
      saveRecentPrompt(currentPrompt);

      aiStatus.setOk(`Responses received in ${latencyMs}ms. Type a follow-up below.`);
    } catch (error) {
      if (cancelledRef.current) return;
      const message = withRecoveryHint(error, toErrorMessage(error));
      setMessages((prev) => [...prev, { id: currentId + 1, role: 'error', text: message }]);
      aiStatus.setError(message);
      if (shouldCarryOperationalStatus(error, message)) {
        rememberOperationalStatus(message, 'info');
      }
    } finally {
      if (!cancelledRef.current) {
        setAiRunning(false);
        setStep(null);
      }
    }
  }

  return (
    <div className="stack">
      {/* Presets */}
      <Card title="AI Chat — MCP vs Plain AI" subtitle="Every message is sent to both the MCP-powered AI and a plain LLM side-by-side. Multi-turn conversation supported.">
        <div className="row-tight">
          {AI_PRESETS.map((p) => (
            <Button key={p.label} variant="secondary" onClick={() => applyPreset(p)} className="btn-compact">
              {p.icon} {p.label}
            </Button>
          ))}
        </div>
        {recentPrompts.length > 0 && (
          <div className="recent-prompts">
            <div className="hint">Recent prompts</div>
            <div className="row-tight">
              {recentPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  variant="secondary"
                  onClick={() => setAiPrompt(prompt)}
                  className="btn-tiny"
                >
                  ↺ {prompt.slice(0, 60)}{prompt.length > 60 ? '…' : ''}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Chat thread */}
      <div className="chat-stream">
        {messages.length === 0 && (
          <p className="empty-state chat-empty-state">
            <span className="chat-empty-icon">💬</span><br />
            Start a conversation! Ask a legal question and see how MCP-powered AI compares to a plain LLM.
            <br /><span className="chat-empty-hint">Try a preset above or type your own question below.</span>
          </p>
        )}
        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="chat-user-row">
                <div className="chat-user-bubble">
                  {msg.prompt}
                </div>
              </div>
            );
          }
          if (msg.role === 'error') {
            return (
              <div key={msg.id} className="chat-error-banner">
                🔴 {msg.text}
              </div>
            );
          }
          if (msg.role === 'comparison') {
            return (
              <div key={msg.id} className="chat-comparison-item">
                <div className="comparison-grid">
                  {/* MCP side */}
                  <div className="comparison-card comparison-card-mcp">
                    <div className="comparison-card-header">
                      <span className="comparison-icon">🔌</span>
                      <strong className="comparison-card-title">With MCP Tools</strong>
                      <span className="comparison-pill comparison-pill-mcp">LIVE DATA</span>
                    </div>
                    {msg.mcpTool && (
                      <div className="comparison-tool-meta">
                        🔧 <strong>{msg.mcpTool}</strong>
                        {msg.mcpToolReason ? <span className="comparison-tool-reason"> — {msg.mcpToolReason}</span> : null}
                        {msg.mcpFallback ? <span className="comparison-tool-warning"> ⚠️ fallback</span> : null}
                      </div>
                    )}
                    <div className="comparison-card-body">
                      {renderMarkdown(msg.mcpResponse || '')}
                    </div>
                  </div>
                  {/* Plain AI side */}
                  <div className="comparison-card comparison-card-plain">
                    <div className="comparison-card-header">
                      <span className="comparison-icon">🧠</span>
                      <strong className="comparison-card-title">Without MCP</strong>
                      <span className="comparison-pill comparison-pill-plain">TRAINING ONLY</span>
                    </div>
                    <div className="comparison-card-body">
                      {renderMarkdown(msg.plainResponse || '')}
                    </div>
                  </div>
                </div>
                {msg.latencyMs != null && (
                  <div className="comparison-latency">
                    ⏱ {msg.latencyMs}ms
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); void sendAiChat(); }}>
          <div className="chat-controls-row">
            <div className="chat-control-grow">
              <label className="field-label-compact">MCP Tool</label>
              <ToolSelect value={aiToolName} onChange={setAiToolName} includeAuto tools={tools} />
            </div>
            <div className="chat-control-fixed">
              <label className="field-label-compact">Cost mode</label>
              <select value={aiMode} onChange={(e) => setAiMode(e.target.value as typeof aiMode)}>
                <option value="cheap">cheap</option>
                <option value="balanced">balanced</option>
              </select>
            </div>
            {chatHistory.length > 0 && (
              <div className="chat-control-action">
                <Button variant="secondary" onClick={clearConversation} className="btn-tiny">
                  🗑 Clear ({chatHistory.length / 2} turn{chatHistory.length > 2 ? 's' : ''})
                </Button>
              </div>
            )}
          </div>
          <div className="chat-input-row">
            <textarea
              id="aiChatPrompt"
              rows={2}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={chatHistory.length > 0 ? 'Ask a follow-up question...' : 'Ask a legal research question...'}
              className="chat-input-textarea"
            />
            <Button type="submit" disabled={aiRunning} className="chat-send-btn">
              {aiRunning ? `${elapsed}s...` : 'Send'}
            </Button>
          </div>
          {step && (
            <div className="chat-step-banner">
              {step}
            </div>
          )}
          <StatusBanner message={aiStatus.status} type={aiStatus.statusType} />
        </form>
      </Card>
    </div>
  );
}

// ─── Compare Panel (Side-by-side: MCP vs Plain AI) ──────────────

interface CompareResult {
  label: string;
  response: string;
  latencyMs: number;
  tool?: string;
  toolReason?: string;
  mode: string;
  hasMcp: boolean;
}

function ComparePanel({ tools }: { tools: ToolInfo[] }): React.JSX.Element {
  const { token, tokenMissing, mcpSessionId, setMcpSessionId } = usePlayground();
  const [prompt, setPrompt] = React.useState('What are the leading Supreme Court cases about free speech in schools?');
  const [aiMode, setAiMode] = React.useState<'cheap' | 'balanced'>('cheap');
  const [aiToolName, setAiToolName] = React.useState('auto');
  const [running, setRunning] = React.useState(false);
  const [results, setResults] = React.useState<CompareResult[]>([]);
  const elapsed = useElapsedTimer(running);
  const cancelledRef = React.useRef(false);
  React.useEffect(() => { return () => { cancelledRef.current = true; }; }, []);
  React.useEffect(() => {
    if (aiToolName !== 'auto' && !tools.some((tool) => tool.name === aiToolName)) {
      setAiToolName('auto');
    }
  }, [aiToolName, tools]);

  function applyPreset(preset: Preset): void {
    setAiToolName(preset.toolName);
    setPrompt(preset.prompt);
    setResults([]);
  }

  async function runComparison(): Promise<void> {
    if (!prompt.trim()) return;
    const currentPrompt = prompt.trim();
    setRunning(true);
    setResults([]);

    // Fire both requests in parallel
    const [mcpResult, plainResult] = await Promise.allSettled([
      aiChat({
        message: currentPrompt,
        mcpToken: token || undefined,
        mcpSessionId: mcpSessionId || undefined,
        toolName: aiToolName,
        mode: aiMode,
      }),
      aiPlain({ message: currentPrompt, mode: aiMode }),
    ]);

    if (cancelledRef.current) return;

    const newResults: CompareResult[] = [];

    if (mcpResult.status === 'fulfilled') {
      const r = mcpResult.value;
      if (r.session_id) setMcpSessionId(r.session_id);
      newResults.push({
        label: 'With MCP Tools',
        response: r.ai_response,
        latencyMs: 0, // We'll use the wall time below
        tool: r.tool,
        toolReason: r.tool_reason,
        mode: r.mode,
        hasMcp: true,
      });
    } else {
      newResults.push({
        label: 'With MCP Tools',
        response: `Error: ${reasonMessage(mcpResult.reason)}`,
        latencyMs: 0,
        mode: aiMode,
        hasMcp: true,
      });
    }

    if (plainResult.status === 'fulfilled') {
      newResults.push({
        label: 'Without MCP (LLM Only)',
        response: plainResult.value.ai_response,
        latencyMs: 0,
        mode: plainResult.value.mode,
        hasMcp: false,
      });
    } else {
      newResults.push({
        label: 'Without MCP (LLM Only)',
        response: `Error: ${reasonMessage(plainResult.reason)}`,
        latencyMs: 0,
        mode: aiMode,
        hasMcp: false,
      });
    }

    setResults(newResults);
    setRunning(false);
  }

  return (
    <div className="stack">
      <Card title="Side-by-Side Comparison" subtitle="Send the same prompt with and without MCP tools to see the difference real-time legal data makes.">
        <div className="row-tight compare-presets">
          {AI_PRESETS.slice(0, 4).map((p) => (
            <Button key={p.label} variant="secondary" onClick={() => applyPreset(p)} className="btn-compact">
              {p.icon} {p.label}
            </Button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void runComparison(); }}>
          <FormField id="compareToolName" label="MCP Tool (for MCP side)">
            <ToolSelect value={aiToolName} onChange={setAiToolName} includeAuto tools={tools} />
          </FormField>
          <FormField id="compareMode" label="Cost mode">
            <select id="compareMode" value={aiMode} onChange={(e) => setAiMode(e.target.value as typeof aiMode)}>
              <option value="cheap">cheap (recommended)</option>
              <option value="balanced">balanced</option>
            </select>
          </FormField>
          <FormField id="comparePrompt" label="Prompt (sent to both)">
            <textarea id="comparePrompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Enter a legal research question..." />
          </FormField>
          <Button type="submit" disabled={running}>
            {running ? `Comparing... (${elapsed}s)` : '⚡ Run Comparison'}
          </Button>
        </form>
      </Card>

      {results.length === 2 && (
        <div className="comparison-grid comparison-grid-wide">
          {results.map((r) => (
            <div key={r.label} className={`comparison-card comparison-card-lg ${r.hasMcp ? 'comparison-card-mcp' : 'comparison-card-plain'}`.trim()}>
              <div className="comparison-card-header comparison-card-header-lg">
                <span className="comparison-icon comparison-icon-lg">{r.hasMcp ? '🔌' : '🧠'}</span>
                <strong className="comparison-card-title comparison-card-title-lg">{r.label}</strong>
                {r.hasMcp && <span className="comparison-pill comparison-pill-mcp">MCP</span>}
              </div>
              {r.tool && (
                <div className="comparison-tool-meta comparison-tool-meta-lg">
                  🔧 <strong>{r.tool}</strong>{r.toolReason ? ` — ${r.toolReason}` : ''}
                </div>
              )}
              <div className="comparison-card-body">
                {renderMarkdown(r.response)}
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length === 2 && (
        <Card title="What this shows">
          <p className="comparison-summary">
            <strong>With MCP:</strong> The AI queried CourtListener&apos;s live database via the Model Context Protocol, retrieving real case data, citations, and metadata before generating its response.
            <br />
            <strong>Without MCP:</strong> The same AI model answered using only its training data — no live data access, no tool calls, no real-time verification.
            <br /><br />
            This demonstrates how MCP bridges AI models with authoritative legal data sources, producing responses grounded in real, up-to-date information.
          </p>
        </Card>
      )}
    </div>
  );
}

// ─── Transcript Entry ────────────────────────────────────────────

const ROLE_STYLES: Record<string, { icon: string; color: string }> = {
  user: { icon: '🟢', color: 'var(--color-text)' },
  assistant: { icon: '🤖', color: 'var(--color-primary, #3b82f6)' },
  system: { icon: '⚙️', color: 'var(--color-muted, #888)' },
  error: { icon: '🔴', color: 'var(--color-error, #ef4444)' },
};

const TranscriptEntry = React.memo(function TranscriptEntry({ item, onRetry }: { item: TranscriptItem; onRetry?: () => void }): React.JSX.Element {
  const [copied, setCopied] = React.useState(false);
  const style = ROLE_STYLES[item.role] || ROLE_STYLES.system!;

  function copyText(): void {
    void navigator.clipboard.writeText(item.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const isAssistant = item.role === 'assistant';
  const isLongText = item.text.length > 200;
  const bodyContent = React.useMemo(
    () => (isAssistant && isLongText ? renderMarkdown(item.text) : item.text),
    [isAssistant, isLongText, item.text],
  );

  return (
    <div className={`line ${item.role}`} style={{ borderLeft: `3px solid ${style.color}`, paddingLeft: '10px', marginBottom: '8px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
        <span>{style.icon}</span>
        <strong style={{ color: style.color, fontSize: '0.8rem', textTransform: 'uppercase' }}>{item.role}</strong>
        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{item.at.split('T')[1]?.split('.')[0]}</span>
        <button
          type="button"
          onClick={copyText}
          title="Copy to clipboard"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', opacity: 0.6, padding: '2px 4px' }}
        >
          {copied ? '✓' : '📋'}
        </button>
        {item.role === 'error' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            title="Retry"
            style={{ background: 'none', border: '1px solid var(--color-error)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--color-error)', padding: '1px 6px' }}
          >
            Retry
          </button>
        )}
      </div>
      <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
        {bodyContent}
      </div>
    </div>
  );
}, (previous, next) => previous.item === next.item && previous.onRetry === next.onRetry);

// ─── Protocol Inspector ─────────────────────────────────────────

function ProtocolInspector(): React.JSX.Element {
  const { protocolLog, clearProtocol } = usePlayground();
  const [expanded, setExpanded] = React.useState(false);

  if (protocolLog.length === 0) return <></>;

  return (
    <Card title="Protocol Inspector" subtitle="Raw JSON-RPC messages exchanged with the MCP server.">
      <div className="row">
        <Button variant="secondary" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide' : `Show ${protocolLog.length} messages`}
        </Button>
        <Button variant="secondary" onClick={clearProtocol}>Clear</Button>
      </div>
      {expanded && (
        <div className="protocol-log">
          {protocolLog.map((entry, i) => (
            <div key={i} className={`protocol-entry ${entry.direction}`.trim()}>
              <div className={`protocol-entry-heading ${entry.direction}`.trim()}>
                {entry.direction === 'request' ? '→ REQUEST' : '← RESPONSE'} <span className="protocol-entry-time">{entry.at.split('T')[1]?.split('.')[0]}</span>
              </div>
              <pre className="mono protocol-entry-payload">
                {JSON.stringify(entry.payload, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Main Playground Page ────────────────────────────────────────

export function PlaygroundPage(): React.JSX.Element {
  useDocumentTitle('Playground');
  const { token } = useToken();

  return (
    <PlaygroundProvider token={token}>
      <PlaygroundContent />
    </PlaygroundProvider>
  );
}

function PlaygroundContent(): React.JSX.Element {
  const { token, tokenMissing, mcpSessionId, transcript, clearTranscript, lastRawMcp, protocolLog } = usePlayground();
  const [searchParams] = useSearchParams();
  const deepLinkedJobId = searchParams.get('jobId')?.trim() ?? '';
  const [carriedStatus] = React.useState(() => consumeOperationalStatus());
  type PlaygroundTab = 'ai' | 'compare' | 'raw';
  const [activeTab, setActiveTab] = React.useState<PlaygroundTab>(() => {
    if (deepLinkedJobId) return 'raw';
    const stored = localStorage.getItem('clmcp_playground_tab');
    return stored === 'compare' || stored === 'raw' ? stored : 'ai';
  });
  const [showCatalog, setShowCatalog] = React.useState(false);
  const [toolCatalog, setToolCatalog] = React.useState<ToolInfo[]>(TOOL_CATALOG);
  const transcriptRef = useAutoScroll<HTMLDivElement>([transcript]);
  const discoveryRpcIdRef = React.useRef(10000);

  const aiTabId = 'tab-ai';
  const compareTabId = 'tab-compare';
  const rawTabId = 'tab-raw';
  const aiPanelId = 'panel-ai';
  const comparePanelId = 'panel-compare';
  const rawPanelId = 'panel-raw';
  const tabOrder: PlaygroundTab[] = ['ai', 'compare', 'raw'];
  const tabRefs = React.useRef<Record<PlaygroundTab, HTMLButtonElement | null>>({
    ai: null,
    compare: null,
    raw: null,
  });

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentTab: PlaygroundTab): void {
    const currentIndex = tabOrder.indexOf(currentTab);
    if (currentIndex < 0) return;
    let nextTab: PlaygroundTab | null = null;
    if (event.key === 'ArrowRight') {
      nextTab = tabOrder[(currentIndex + 1) % tabOrder.length]!;
    } else if (event.key === 'ArrowLeft') {
      nextTab = tabOrder[(currentIndex - 1 + tabOrder.length) % tabOrder.length]!;
    } else if (event.key === 'Home') {
      nextTab = tabOrder[0]!;
    } else if (event.key === 'End') {
      nextTab = tabOrder[tabOrder.length - 1]!;
    }
    if (!nextTab) return;
    event.preventDefault();
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  React.useEffect(() => {
    if (tokenMissing) {
      setToolCatalog(TOOL_CATALOG);
      return;
    }

    let cancelled = false;
    async function discoverTools(): Promise<void> {
      try {
        const result = await mcpCall<unknown>({
          method: 'tools/list',
          params: {},
          sessionId: mcpSessionId || undefined,
          id: discoveryRpcIdRef.current++,
        }, token);
        if (cancelled) return;
        const discovered = normalizeDiscoveredTools(result.body);
        setToolCatalog(discovered.length > 0 ? discovered : TOOL_CATALOG);
      } catch {
        if (!cancelled) setToolCatalog(TOOL_CATALOG);
      }
    }

    void discoverTools();
    return () => { cancelled = true; };
  }, [mcpSessionId, token, tokenMissing]);

  React.useEffect(() => {
    localStorage.setItem('clmcp_playground_tab', activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    if (deepLinkedJobId && activeTab !== 'raw') {
      setActiveTab('raw');
    }
  }, [activeTab, deepLinkedJobId]);

  function handleExport(): void {
    const data = JSON.stringify({ transcript, protocol: protocolLog }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-transcript-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <div className="row row-spacious">
        <SessionBadge toolCount={toolCatalog.length} />
        <Button variant="secondary" onClick={() => setShowCatalog(!showCatalog)} className="btn-tiny">
          {showCatalog ? 'Hide' : 'Show'} Tool Catalog ({toolCatalog.length})
        </Button>
      </div>

      {showCatalog && <ToolCatalogPanel tools={toolCatalog} />}

      {carriedStatus?.message ? (
        <Card title="Recovery status" subtitle="Recovery UX carries recent auth/playground errors across pages for guided follow-up.">
          <StatusBanner message={carriedStatus.message} type={carriedStatus.type} />
          <div className="row">
            <Link to="/app/account" className="btn secondary">Review session status</Link>
            <Link to="/app/control-center" className="text-link">Open control center</Link>
          </div>
        </Card>
      ) : null}

      {tokenMissing && (
        <StatusBanner role="alert" message="No local MCP credential set. Open Operator Session to load one for direct probes." type="error" />
      )}

      <Card title="Quick workflow" subtitle="Recommended order: set token, run AI chat, compare outputs, then use raw MCP console for debugging.">
        <div className="row">
          <Link to="/app/account" className="btn secondary">1) Set token</Link>
          <Button variant="secondary" onClick={() => setActiveTab('ai')}>2) AI Chat</Button>
          <Button variant="secondary" onClick={() => setActiveTab('compare')}>3) Compare</Button>
          <Button variant="secondary" onClick={() => setActiveTab('raw')}>4) Raw Console</Button>
        </div>
      </Card>

      <div className="tabs" role="tablist" aria-label="Playground mode" aria-orientation="horizontal">
        <button
          type="button"
          id={aiTabId}
          ref={(node) => {
            tabRefs.current.ai = node;
          }}
          role="tab"
          aria-selected={activeTab === 'ai'}
          aria-controls={aiPanelId}
          tabIndex={activeTab === 'ai' ? 0 : -1}
          className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
          onKeyDown={(event) => handleTabKeyDown(event, 'ai')}
        >
          💬 AI Chat
        </button>
        <button
          type="button"
          id={compareTabId}
          ref={(node) => {
            tabRefs.current.compare = node;
          }}
          role="tab"
          aria-selected={activeTab === 'compare'}
          aria-controls={comparePanelId}
          tabIndex={activeTab === 'compare' ? 0 : -1}
          className={`tab-btn ${activeTab === 'compare' ? 'active' : ''}`}
          onClick={() => setActiveTab('compare')}
          onKeyDown={(event) => handleTabKeyDown(event, 'compare')}
        >
          ⚡ Compare
        </button>
        <button
          type="button"
          id={rawTabId}
          ref={(node) => {
            tabRefs.current.raw = node;
          }}
          role="tab"
          aria-selected={activeTab === 'raw'}
          aria-controls={rawPanelId}
          tabIndex={activeTab === 'raw' ? 0 : -1}
          className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
          onKeyDown={(event) => handleTabKeyDown(event, 'raw')}
        >
          🔧 Raw MCP Console
        </button>
      </div>

      <div
        id={aiPanelId}
        role="tabpanel"
        aria-labelledby={aiTabId}
        hidden={activeTab !== 'ai'}
      >
        {activeTab === 'ai' && <AiChatPanel tools={toolCatalog} />}
      </div>

      <div
        id={comparePanelId}
        role="tabpanel"
        aria-labelledby={compareTabId}
        hidden={activeTab !== 'compare'}
      >
        {activeTab === 'compare' && <ComparePanel tools={toolCatalog} />}
      </div>

      <div
        id={rawPanelId}
        role="tabpanel"
        aria-labelledby={rawTabId}
        hidden={activeTab !== 'raw'}
      >
        {activeTab === 'raw' && <RawMcpPanel tools={toolCatalog} />}
      </div>

      {/* Transcript for Raw MCP Console */}
      {activeTab === 'raw' && (
        <Card title="Transcript">
          <div className="transcript mono" ref={transcriptRef}>
            {transcript.length === 0 ? <p className="empty-state"><span className="empty-icon">📋</span><br />No messages yet. Connect and call a tool above.</p> : null}
            {transcript.map((item, i) => (
              <TranscriptEntry key={`${item.at}-${i}`} item={item} />
            ))}
          </div>
          <div className="row">
            <Button variant="secondary" onClick={clearTranscript}>Clear transcript</Button>
            {transcript.length > 0 && (
              <Button variant="secondary" onClick={handleExport}>Export JSON</Button>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'raw' && protocolLog.length > 0 && <ProtocolInspector />}

      {activeTab === 'ai' && lastRawMcp ? (
        <Card title="Raw MCP Response" subtitle="Debug: what the MCP tool returned before AI processing.">
          <pre className="raw-response mono">{lastRawMcp}</pre>
        </Card>
      ) : null}
    </div>
  );
}
