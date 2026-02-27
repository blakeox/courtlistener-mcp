import React from 'react';
import { mcpCall, toErrorMessage } from '../lib/api';
import { markFirstMcpSuccess, trackEvent } from '../lib/telemetry';
import { readToken, saveToken, isPersistedToken } from '../lib/storage';
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';

interface TranscriptItem {
  role: 'system' | 'user' | 'assistant' | 'error';
  text: string;
  at: string;
}

function toolArguments(toolName: string, prompt: string): Record<string, unknown> {
  if (toolName === 'lookup_citation') {
    return { citation: prompt };
  }
  return {
    query: prompt,
    page_size: 5,
    order_by: 'score desc',
  };
}

export function ConsolePage(): React.JSX.Element {
  const [token, setToken] = React.useState('');
  const [persist, setPersist] = React.useState(false);
  const [mcpSessionId, setMcpSessionId] = React.useState('');
  const [toolName, setToolName] = React.useState('search_cases');
  const [prompt, setPrompt] = React.useState('Roe v Wade abortion rights');
  const [connectStatus, setConnectStatus] = React.useState('');
  const [chatStatus, setChatStatus] = React.useState('');
  const [connectType, setConnectType] = React.useState<'ok' | 'error' | 'info'>('info');
  const [chatType, setChatType] = React.useState<'ok' | 'error' | 'info'>('info');
  const [transcript, setTranscript] = React.useState<TranscriptItem[]>([]);
  const [rpcId, setRpcId] = React.useState(1);
  const [connecting, setConnecting] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    setToken(readToken());
    setPersist(isPersistedToken());
  }, []);

  function append(role: TranscriptItem['role'], text: string): void {
    setTranscript((existing) => [...existing, { role, text, at: new Date().toISOString() }]);
  }

  async function connect(): Promise<void> {
    setConnecting(true);
    setConnectStatus('Connecting...');
    setConnectType('info');
    try {
      const nextId = rpcId;
      setRpcId((value) => value + 1);
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
      if (result.sessionId) {
        setMcpSessionId(result.sessionId);
      }
      append('system', 'MCP initialized');
      append('system', JSON.stringify(result.body));
      setConnectStatus(`Connected. Session: ${result.sessionId ?? mcpSessionId ?? 'none'}`);
      setConnectType('ok');
    } catch (error) {
      setConnectStatus(toErrorMessage(error));
      setConnectType('error');
      append('error', toErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  }

  async function send(): Promise<void> {
    if (!prompt.trim()) {
      setChatStatus('Enter a prompt.');
      setChatType('error');
      return;
    }
    if (!mcpSessionId) {
      setChatStatus('Connect MCP session first.');
      setChatType('error');
      return;
    }

    setSending(true);
    setChatStatus('Calling tool...');
    setChatType('info');

    append('user', prompt);
    try {
      const nextId = rpcId;
      setRpcId((value) => value + 1);
      const started = performance.now();
      const result = await mcpCall<unknown>(
        {
          method: 'tools/call',
          params: { name: toolName, arguments: toolArguments(toolName, prompt) },
          sessionId: mcpSessionId,
          id: nextId,
        },
        token,
      );
      const latencyMs = Math.round(performance.now() - started);
      append('assistant', JSON.stringify(result.body));
      setChatStatus(`Response received in ${latencyMs}ms.`);
      setChatType('ok');
      const duration = markFirstMcpSuccess();
      trackEvent('mcp_tool_call_succeeded', { latency_ms: latencyMs, signup_to_first_ms: duration ?? 0 });
    } catch (error) {
      const message = toErrorMessage(error);
      append('error', message);
      setChatStatus(message);
      setChatType('error');
      trackEvent('mcp_tool_call_failed', { category: 'network' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stack">
      <div className="two-col">
        <Card title="Connect MCP session" subtitle="Step 1: initialize a session on /mcp.">
          <FormField id="chatToken" label="Bearer token">
            <Input
              id="chatToken"
              type="password"
              placeholder="Paste MCP bearer token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </FormField>
          <label className="inline-check">
            <input
              id="chatPersistToken"
              type="checkbox"
              checked={persist}
              onChange={(event) => setPersist(event.target.checked)}
            />
            Remember token on this device
          </label>
          <div className="row">
            <Button id="connectBtn" disabled={connecting} onClick={connect}>
              {connecting ? 'Connecting...' : 'Connect MCP Session'}
            </Button>
            <Button
              id="saveChatTokenBtn"
              variant="secondary"
              onClick={() => {
                if (!token.trim()) {
                  setConnectStatus('Token is empty.');
                  setConnectType('error');
                  return;
                }
                saveToken(token, persist);
                setConnectStatus(persist ? 'Token saved to localStorage.' : 'Token saved to sessionStorage.');
                setConnectType('ok');
              }}
            >
              Save token
            </Button>
            <Button id="smokeTestBtn" variant="secondary" onClick={() => setPrompt('Roe v Wade abortion rights case')}>Run quick smoke test preset</Button>
          </div>
          <StatusBanner id="connectStatus" message={connectStatus} type={connectType} />
        </Card>

        <Card title="Tool call" subtitle="Step 2: call a tool inside the active session.">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <FormField id="toolName" label="Tool">
              <select id="toolName" value={toolName} onChange={(event) => setToolName(event.target.value)}>
                <option value="search_opinions">search_opinions</option>
                <option value="search_cases">search_cases</option>
                <option value="lookup_citation">lookup_citation</option>
              </select>
            </FormField>
            <FormField id="chatPrompt" label="Prompt">
              <Input id="chatPrompt" type="text" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </FormField>
            <Button id="sendBtn" type="submit" disabled={sending}>
              {sending ? 'Sending...' : 'Send'}
            </Button>
            <StatusBanner id="chatStatus" message={chatStatus} type={chatType} />
          </form>
        </Card>
      </div>

      <Card title="Transcript">
        <div id="transcript" className="transcript mono">
          {transcript.length === 0 ? <p>No messages yet.</p> : null}
          {transcript.map((item, index) => (
            <div key={`${item.at}-${index}`} className={`line ${item.role}`}>
              <strong>{item.role}</strong> [{item.at}] {item.text}
            </div>
          ))}
        </div>
        <div className="row">
          <Button
            id="clearTranscriptBtn"
            variant="secondary"
            onClick={() => {
              setTranscript([]);
            }}
          >
            Clear transcript
          </Button>
        </div>
      </Card>
    </div>
  );
}
