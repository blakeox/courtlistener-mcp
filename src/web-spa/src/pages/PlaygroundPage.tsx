import React from 'react';
import { mcpCall, aiChat, toErrorMessage } from '../lib/api';
import { markFirstMcpSuccess, trackEvent } from '../lib/telemetry';
import { useToken } from '../lib/token-context';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStatus } from '../hooks/useStatus';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { PlaygroundProvider, usePlayground } from '../lib/playground-context';
import type { TranscriptItem } from '../lib/playground-context';
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';

// ─── Tool Catalog ────────────────────────────────────────────────

interface ToolInfo {
  name: string;
  description: string;
  category: string;
  argHint: string;
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

const CATEGORIES = [...new Set(TOOL_CATALOG.map((t) => t.category))];

function toolArguments(toolName: string, prompt: string): Record<string, unknown> {
  const tool = TOOL_CATALOG.find((t) => t.name === toolName);
  if (!tool) return { query: prompt };
  if (toolName === 'lookup_citation') return { citation: prompt };
  if (toolName === 'validate_citations') return { text: prompt };
  if (toolName === 'list_courts') return {};
  if (toolName === 'analyze_legal_argument') return { argument: prompt, keywords: prompt.split(/\s+/).slice(0, 5) };
  if (tool.argHint === 'query') return { query: prompt, page_size: 5, order_by: 'score desc' };
  const idMatch = prompt.match(/\b(\d+)\b/);
  if (idMatch && ['cluster_id', 'opinion_id', 'judge_id', 'docket_id', 'document_id', 'disclosure_id', 'argument_id'].includes(tool.argHint)) {
    return { [tool.argHint]: idMatch[1] };
  }
  return { query: prompt, page_size: 5 };
}

// ─── Tool Select Dropdown (shared) ──────────────────────────────

function ToolSelect({ value, onChange, includeAuto }: {
  value: string;
  onChange: (v: string) => void;
  includeAuto?: boolean;
}): React.JSX.Element {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {includeAuto && <option value="auto">🤖 auto (AI selects best tool)</option>}
      {CATEGORIES.map((cat) => (
        <optgroup key={cat} label={cat}>
          {TOOL_CATALOG.filter((t) => t.category === cat).map((t) => (
            <option key={t.name} value={t.name} title={t.description}>
              {t.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

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
      elements.push(<h4 key={i} style={{ margin: '8px 0 4px' }}>{inlineFormat(line.slice(4))}</h4>);
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={i} style={{ margin: '10px 0 4px' }}>{inlineFormat(line.slice(3))}</h3>);
    } else if (line.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={i} style={{ margin: '12px 0 4px' }}>{inlineFormat(line.slice(2))}</h2>);
    } else if (/^[-*]\s/.test(line)) {
      listItems.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s/, ''));
    } else {
      flushList();
      if (line.trim()) {
        elements.push(<p key={i} style={{ margin: '4px 0' }}>{inlineFormat(line)}</p>);
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

// ─── Tool Catalog Panel ─────────────────────────────────────────

function ToolCatalogPanel(): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <Card title={`Available MCP Tools (${TOOL_CATALOG.length})`} subtitle="All tools accessible through the Model Context Protocol.">
      <Button variant="secondary" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Hide catalog' : 'Show all tools'}
      </Button>
      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {CATEGORIES.map((cat) => (
            <div key={cat} style={{ marginBottom: '12px' }}>
              <h4 style={{ margin: '0 0 6px', color: 'var(--color-primary)' }}>{cat}</h4>
              <div style={{ display: 'grid', gap: '6px' }}>
                {TOOL_CATALOG.filter((t) => t.category === cat).map((t) => (
                  <div key={t.name} style={{
                    padding: '8px 12px',
                    background: 'var(--color-surface)',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.9rem',
                  }}>
                    <code style={{ fontWeight: 600 }}>{t.name}</code>
                    <span style={{ marginLeft: '8px', opacity: 0.7 }}>{t.description}</span>
                    {t.argHint && <span style={{ marginLeft: '8px', opacity: 0.5, fontSize: '0.8rem' }}>({t.argHint})</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Session Badge ──────────────────────────────────────────────

function SessionBadge(): React.JSX.Element {
  const { mcpSessionId } = usePlayground();
  const connected = mcpSessionId.length > 0;
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '0.8rem',
      background: connected ? 'var(--color-success-bg, rgba(34,197,94,0.1))' : 'var(--color-surface)',
      border: `1px solid ${connected ? 'var(--color-success, #22c55e)' : 'var(--color-border)'}`,
      color: connected ? 'var(--color-success, #22c55e)' : 'var(--color-muted)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#22c55e' : '#888', display: 'inline-block' }} />
      {connected ? `Session: ${mcpSessionId.slice(0, 8)}…` : 'No session'}
      {connected && <span style={{ opacity: 0.6 }}>| {TOOL_CATALOG.length} tools</span>}
    </div>
  );
}

// ─── Raw MCP Panel ───────────────────────────────────────────────

function RawMcpPanel(): React.JSX.Element {
  const { token, tokenMissing, mcpSessionId, setMcpSessionId, append, addProtocolEntry } = usePlayground();
  const { toast } = useToast();
  const [toolName, setToolName] = React.useState('search_cases');
  const [prompt, setPrompt] = React.useState('Roe v Wade abortion rights');
  const connectStatus = useStatus();
  const chatStatus = useStatus();
  const [rpcId, setRpcId] = React.useState(1);
  const [connecting, setConnecting] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const elapsed = useElapsedTimer(sending);
  const cancelledRef = React.useRef(false);
  React.useEffect(() => {
    return () => { cancelledRef.current = true; };
  }, []);
  useKeyboardShortcut('Enter', () => { void sendRaw(); }, { disabled: sending || tokenMissing });

  async function connect(): Promise<void> {
    if (!token.trim()) {
      connectStatus.setError('Set a bearer token first (API Keys page).');
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
      connectStatus.setError(toErrorMessage(error));
      append('error', toErrorMessage(error));
    } finally {
      if (!cancelledRef.current) setConnecting(false);
    }
  }

  async function sendRaw(): Promise<void> {
    if (!prompt.trim()) { chatStatus.setError('Enter a prompt.'); return; }
    if (!mcpSessionId) { chatStatus.setError('Connect MCP session first.'); return; }
    setSending(true);
    chatStatus.setInfo(`Calling ${toolName}...`);
    append('user', prompt);
    try {
      const nextId = rpcId;
      setRpcId((v) => v + 1);
      const reqPayload = { method: 'tools/call', params: { name: toolName, arguments: toolArguments(toolName, prompt) }, sessionId: mcpSessionId, id: nextId };
      addProtocolEntry('request', reqPayload);
      const started = performance.now();
      const result = await mcpCall<unknown>(reqPayload, token);
      if (cancelledRef.current) return;
      addProtocolEntry('response', result.body);
      const latencyMs = Math.round(performance.now() - started);
      append('assistant', JSON.stringify(result.body));
      chatStatus.setOk(`Response received in ${latencyMs}ms.`);
      const duration = markFirstMcpSuccess();
      trackEvent('mcp_tool_call_succeeded', { latency_ms: latencyMs, signup_to_first_ms: duration ?? 0 });
    } catch (error) {
      if (cancelledRef.current) return;
      const message = toErrorMessage(error);
      append('error', message);
      chatStatus.setError(message);
      trackEvent('mcp_tool_call_failed', { category: 'network' });
    } finally {
      if (!cancelledRef.current) setSending(false);
    }
  }

  return (
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
            <ToolSelect value={toolName} onChange={setToolName} />
          </FormField>
          <FormField id="chatPrompt" label="Prompt / Arguments">
            <Input id="chatPrompt" type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={TOOL_CATALOG.find((t) => t.name === toolName)?.argHint || 'Enter value...'} />
          </FormField>
          <Button id="sendBtn" type="submit" disabled={sending || tokenMissing}>
            {sending ? `Sending... (${elapsed}s)` : 'Send'}
          </Button>
          <span className="hint" style={{ marginLeft: '8px' }}>⌘/Ctrl+Enter</span>
          <StatusBanner id="chatStatus" message={chatStatus.status} type={chatStatus.statusType} />
        </form>
      </Card>
    </div>
  );
}

// ─── AI Chat Panel ───────────────────────────────────────────────

function AiChatPanel(): React.JSX.Element {
  const { token, tokenMissing, mcpSessionId, setMcpSessionId, append, setLastRawMcp } = usePlayground();
  const [aiMode, setAiMode] = React.useState<'cheap' | 'balanced'>('cheap');
  const [aiTestMode, setAiTestMode] = React.useState(false);
  const [aiToolName, setAiToolName] = React.useState('auto');
  const [aiPrompt, setAiPrompt] = React.useState('Find leading Supreme Court cases about free speech in schools and explain what they generally hold.');
  const aiStatus = useStatus();
  const [aiRunning, setAiRunning] = React.useState(false);
  const [step, setStep] = React.useState<string | null>(null);
  const elapsed = useElapsedTimer(aiRunning);
  const cancelledRef = React.useRef(false);
  React.useEffect(() => {
    return () => { cancelledRef.current = true; };
  }, []);
  useKeyboardShortcut('Enter', () => { void sendAiChat(); }, { disabled: aiRunning || tokenMissing });

  function applyPreset(preset: Preset): void {
    setAiToolName(preset.toolName);
    setAiPrompt(preset.prompt);
  }

  async function sendAiChat(): Promise<void> {
    if (!aiPrompt.trim()) { aiStatus.setError('Enter a prompt.'); return; }
    if (!token.trim()) { aiStatus.setError('Set a bearer token first (API Keys page).'); return; }
    setAiRunning(true);
    setStep('① Initializing MCP session...');
    append('user', aiPrompt);
    try {
      setStep('② Calling MCP tool...');
      const started = performance.now();
      const result = await aiChat({
        message: aiPrompt,
        mcpToken: token,
        mcpSessionId: mcpSessionId || undefined,
        toolName: aiToolName,
        mode: aiMode,
        testMode: aiTestMode,
      });
      if (cancelledRef.current) return;
      setStep('③ Processing AI response...');
      const latencyMs = Math.round(performance.now() - started);
      setMcpSessionId(result.session_id || mcpSessionId);
      setLastRawMcp(JSON.stringify(result.mcp_result, null, 2));

      const reasonText = result.tool_reason ? ` — ${result.tool_reason}` : '';
      append('system', `🔧 Tool: ${result.tool}${reasonText} | Mode: ${result.mode} | ${latencyMs}ms${result.fallback_used ? ' | ⚠️ AI fallback' : ''}`);
      append('assistant', result.ai_response);
      aiStatus.setOk(`Response received in ${latencyMs}ms.`);
    } catch (error) {
      if (cancelledRef.current) return;
      const message = toErrorMessage(error);
      append('error', message);
      aiStatus.setError(message);
    } finally {
      if (!cancelledRef.current) {
        setAiRunning(false);
        setStep(null);
      }
    }
  }

  return (
    <div className="two-col">
      <Card title="AI Chat + MCP Tools" subtitle="Chat with AI that uses MCP tools to query CourtListener. 50 turns per account.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {AI_PRESETS.map((p) => (
            <Button key={p.label} variant="secondary" onClick={() => applyPreset(p)} style={{ fontSize: '0.85rem' }}>
              {p.icon} {p.label}
            </Button>
          ))}
        </div>
      </Card>
      <Card title="Send prompt">
        <form onSubmit={(e) => { e.preventDefault(); void sendAiChat(); }}>
          <FormField id="aiToolName" label="Tool">
            <ToolSelect value={aiToolName} onChange={setAiToolName} includeAuto />
          </FormField>
          <FormField id="aiMode" label="Cost mode">
            <select id="aiMode" value={aiMode} onChange={(e) => setAiMode(e.target.value as typeof aiMode)}>
              <option value="cheap">cheap (recommended)</option>
              <option value="balanced">balanced</option>
            </select>
          </FormField>
          <label className="inline-check">
            <input type="checkbox" checked={aiTestMode} onChange={(e) => setAiTestMode(e.target.checked)} />
            Deterministic test mode
          </label>
          <FormField id="aiChatPrompt" label="Prompt">
            <textarea id="aiChatPrompt" rows={4} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
          </FormField>
          {step && (
            <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'var(--color-info-bg, rgba(59,130,246,0.1))', color: 'var(--color-info, #3b82f6)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 500 }}>
              {step}
            </div>
          )}
          <Button type="submit" disabled={aiRunning || tokenMissing}>
            {aiRunning ? `Sending... (${elapsed}s)` : 'Send AI Chat'}
          </Button>
          <span className="hint" style={{ marginLeft: '8px' }}>⌘/Ctrl+Enter</span>
          <StatusBanner message={aiStatus.status} type={aiStatus.statusType} />
        </form>
      </Card>
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

function TranscriptEntry({ item, onRetry }: { item: TranscriptItem; onRetry?: () => void }): React.JSX.Element {
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
        {isAssistant && isLongText ? renderMarkdown(item.text) : item.text}
      </div>
    </div>
  );
}

// ─── Protocol Inspector ─────────────────────────────────────────

function ProtocolInspector(): React.JSX.Element {
  const { protocolLog, clearProtocol } = usePlayground();
  const [expanded, setExpanded] = React.useState(false);

  if (protocolLog.length === 0) return <></>;

  return (
    <Card title="Protocol Inspector" subtitle="Raw JSON-RPC messages exchanged with the MCP server.">
      <div className="row" style={{ gap: '8px' }}>
        <Button variant="secondary" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide' : `Show ${protocolLog.length} messages`}
        </Button>
        <Button variant="secondary" onClick={clearProtocol}>Clear</Button>
      </div>
      {expanded && (
        <div style={{ maxHeight: '300px', overflow: 'auto', marginTop: '8px' }}>
          {protocolLog.map((entry, i) => (
            <div key={i} style={{ marginBottom: '8px', padding: '6px 8px', borderRadius: '4px', background: entry.direction === 'request' ? 'rgba(59,130,246,0.05)' : 'rgba(34,197,94,0.05)', border: `1px solid ${entry.direction === 'request' ? 'rgba(59,130,246,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: entry.direction === 'request' ? '#3b82f6' : '#22c55e', marginBottom: '4px' }}>
                {entry.direction === 'request' ? '→ REQUEST' : '← RESPONSE'} <span style={{ opacity: 0.5, fontWeight: 400 }}>{entry.at.split('T')[1]?.split('.')[0]}</span>
              </div>
              <pre className="mono" style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '150px', overflow: 'auto' }}>
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
  const { tokenMissing, transcript, clearTranscript, lastRawMcp, protocolLog } = usePlayground();
  const [activeTab, setActiveTab] = React.useState<'raw' | 'ai'>('ai');
  const [showCatalog, setShowCatalog] = React.useState(false);
  const transcriptRef = useAutoScroll<HTMLDivElement>([transcript]);

  const rawTabId = 'tab-raw';
  const aiTabId = 'tab-ai';
  const rawPanelId = 'panel-raw';
  const aiPanelId = 'panel-ai';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <SessionBadge />
        <Button variant="secondary" onClick={() => setShowCatalog(!showCatalog)} style={{ fontSize: '0.8rem' }}>
          {showCatalog ? 'Hide' : 'Show'} Tool Catalog ({TOOL_CATALOG.length})
        </Button>
      </div>

      {showCatalog && <ToolCatalogPanel />}

      {tokenMissing && (
        <StatusBanner role="alert" message="No bearer token set. Go to API Keys to create and save a token first." type="error" />
      )}

      <div className="tabs" role="tablist" aria-label="Playground mode">
        <button
          type="button"
          id={aiTabId}
          role="tab"
          aria-selected={activeTab === 'ai'}
          aria-controls={aiPanelId}
          className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          AI Chat
        </button>
        <button
          type="button"
          id={rawTabId}
          role="tab"
          aria-selected={activeTab === 'raw'}
          aria-controls={rawPanelId}
          className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          Raw MCP Console
        </button>
      </div>

      <div
        id={aiPanelId}
        role="tabpanel"
        aria-labelledby={aiTabId}
        hidden={activeTab !== 'ai'}
      >
        {activeTab === 'ai' && <AiChatPanel />}
      </div>

      <div
        id={rawPanelId}
        role="tabpanel"
        aria-labelledby={rawTabId}
        hidden={activeTab !== 'raw'}
      >
        {activeTab === 'raw' && <RawMcpPanel />}
      </div>

      <Card title="Transcript">
        <div className="transcript mono" ref={transcriptRef}>
          {transcript.length === 0 ? <p className="empty-state"><span className="empty-icon">📋</span><br />No messages yet. Try a preset above to get started.</p> : null}
          {transcript.map((item, i) => (
            <TranscriptEntry key={`${item.at}-${i}`} item={item} />
          ))}
        </div>
        <div className="row" style={{ gap: '8px' }}>
          <Button variant="secondary" onClick={clearTranscript}>Clear transcript</Button>
          {transcript.length > 0 && (
            <Button variant="secondary" onClick={handleExport}>Export JSON</Button>
          )}
        </div>
      </Card>

      {activeTab === 'raw' && protocolLog.length > 0 && <ProtocolInspector />}

      {activeTab === 'ai' && lastRawMcp ? (
        <Card title="Raw MCP Response" subtitle="Debug: what the MCP tool returned before AI processing.">
          <pre className="raw-response mono">{lastRawMcp}</pre>
        </Card>
      ) : null}
    </div>
  );
}
