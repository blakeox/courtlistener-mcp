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
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';

function toolArguments(toolName: string, prompt: string): Record<string, unknown> {
  if (toolName === 'lookup_citation') {
    return { citation: prompt };
  }
  return { query: prompt, page_size: 5, order_by: 'score desc' };
}

// ─── Raw MCP Panel ───────────────────────────────────────────────

function RawMcpPanel(): React.JSX.Element {
  const { token, tokenMissing, mcpSessionId, setMcpSessionId, append } = usePlayground();
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
      const result = await mcpCall<unknown>(
        {
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'courtlistener-spa-console', version: '1.0.0' },
          },
          sessionId: mcpSessionId || undefined,
          id: nextId,
        },
        token,
      );
      if (cancelledRef.current) return;
      if (result.sessionId) setMcpSessionId(result.sessionId);
      append('system', 'MCP initialized');
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
    chatStatus.setInfo('Calling tool...');
    append('user', prompt);
    try {
      const nextId = rpcId;
      setRpcId((v) => v + 1);
      const started = performance.now();
      const result = await mcpCall<unknown>(
        { method: 'tools/call', params: { name: toolName, arguments: toolArguments(toolName, prompt) }, sessionId: mcpSessionId, id: nextId },
        token,
      );
      if (cancelledRef.current) return;
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
            <select id="toolName" value={toolName} onChange={(e) => setToolName(e.target.value)}>
              <option value="search_opinions">search_opinions</option>
              <option value="search_cases">search_cases</option>
              <option value="lookup_citation">lookup_citation</option>
            </select>
          </FormField>
          <FormField id="chatPrompt" label="Prompt">
            <Input id="chatPrompt" type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
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
  const [aiToolName, setAiToolName] = React.useState<'auto' | 'search_cases' | 'search_opinions' | 'lookup_citation'>('auto');
  const [aiPrompt, setAiPrompt] = React.useState('Find leading Supreme Court cases about free speech in schools and explain what they generally hold.');
  const aiStatus = useStatus();
  const [aiRunning, setAiRunning] = React.useState(false);
  const elapsed = useElapsedTimer(aiRunning);
  const cancelledRef = React.useRef(false);
  React.useEffect(() => {
    return () => { cancelledRef.current = true; };
  }, []);
  useKeyboardShortcut('Enter', () => { void sendAiChat(); }, { disabled: aiRunning || tokenMissing });

  async function sendAiChat(): Promise<void> {
    if (!aiPrompt.trim()) { aiStatus.setError('Enter a prompt.'); return; }
    if (!token.trim()) { aiStatus.setError('Set a bearer token first (API Keys page).'); return; }
    setAiRunning(true);
    aiStatus.setInfo('Calling Cloudflare AI and MCP tools...');
    append('user', aiPrompt);
    try {
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
      const latencyMs = Math.round(performance.now() - started);
      setMcpSessionId(result.session_id || mcpSessionId);
      setLastRawMcp(JSON.stringify(result.mcp_result, null, 2));
      append('system', `Mode: ${result.mode} | Tool: ${result.tool} | test=${result.test_mode} | fallback=${result.fallback_used}`);
      append('assistant', result.ai_response);
      aiStatus.setOk(`Response received in ${latencyMs}ms.`);
    } catch (error) {
      if (cancelledRef.current) return;
      const message = toErrorMessage(error);
      append('error', message);
      aiStatus.setError(message);
    } finally {
      if (!cancelledRef.current) setAiRunning(false);
    }
  }

  return (
    <div className="two-col">
      <Card title="AI Chat + MCP Tools" subtitle="Chat is capped at 10 turns. After that, use your own model with /mcp.">
        <div className="row">
          <Button variant="secondary" onClick={() => { setAiToolName('search_cases'); setAiPrompt('Find appellate cases discussing qualified immunity for police and summarize key trends.'); }}>
            Preset: Broad search
          </Button>
          <Button variant="secondary" onClick={() => { setAiToolName('lookup_citation'); setAiPrompt('410 U.S. 113'); }}>
            Preset: Citation
          </Button>
          <Button variant="secondary" onClick={() => { setAiToolName('search_opinions'); setAiPrompt('Recent appellate opinions about qualified immunity in excessive force cases'); }}>
            Preset: Opinions
          </Button>
        </div>
      </Card>
      <Card title="Send prompt">
        <form onSubmit={(e) => { e.preventDefault(); void sendAiChat(); }}>
          <FormField id="aiToolName" label="Tool">
            <select id="aiToolName" value={aiToolName} onChange={(e) => setAiToolName(e.target.value as typeof aiToolName)}>
              <option value="auto">auto (let server choose)</option>
              <option value="search_cases">search_cases</option>
              <option value="search_opinions">search_opinions</option>
              <option value="lookup_citation">lookup_citation</option>
            </select>
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
  const { tokenMissing, transcript, clearTranscript, lastRawMcp } = usePlayground();
  const [activeTab, setActiveTab] = React.useState<'raw' | 'ai'>('raw');
  const transcriptRef = useAutoScroll<HTMLDivElement>([transcript]);

  const rawTabId = 'tab-raw';
  const aiTabId = 'tab-ai';
  const rawPanelId = 'panel-raw';
  const aiPanelId = 'panel-ai';

  return (
    <div className="stack">
      {tokenMissing && (
        <StatusBanner role="alert" message="No bearer token set. Go to API Keys to create and save a token first." type="error" />
      )}

      <div className="tabs" role="tablist" aria-label="Playground mode">
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
      </div>

      <div
        id={rawPanelId}
        role="tabpanel"
        aria-labelledby={rawTabId}
        hidden={activeTab !== 'raw'}
      >
        {activeTab === 'raw' && <RawMcpPanel />}
      </div>

      <div
        id={aiPanelId}
        role="tabpanel"
        aria-labelledby={aiTabId}
        hidden={activeTab !== 'ai'}
      >
        {activeTab === 'ai' && <AiChatPanel />}
      </div>

      <Card title="Transcript">
        <div className="transcript mono" ref={transcriptRef}>
          {transcript.length === 0 ? <p className="empty-state"><span className="empty-icon">📋</span><br />No messages yet.</p> : null}
          {transcript.map((item, i) => (
            <div key={`${item.at}-${i}`} className={`line ${item.role}`}>
              <strong>{item.role}</strong> [{item.at}] {item.text}
            </div>
          ))}
        </div>
        <div className="row">
          <Button variant="secondary" onClick={clearTranscript}>Clear transcript</Button>
        </div>
      </Card>

      {activeTab === 'ai' && lastRawMcp ? (
        <Card title="Raw MCP Response" subtitle="Debug: what the MCP tool returned before AI processing.">
          <pre className="raw-response mono">{lastRawMcp}</pre>
        </Card>
      ) : null}
    </div>
  );
}
