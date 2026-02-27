import React from 'react';

interface TranscriptItem {
  role: 'system' | 'user' | 'assistant' | 'error';
  text: string;
  at: string;
  meta?: Record<string, unknown>;
}

interface PlaygroundContextValue {
  token: string;
  tokenMissing: boolean;
  mcpSessionId: string;
  setMcpSessionId: (id: string) => void;
  transcript: TranscriptItem[];
  append: (role: TranscriptItem['role'], text: string, meta?: Record<string, unknown>) => void;
  clearTranscript: () => void;
  lastRawMcp: string;
  setLastRawMcp: (v: string) => void;
  protocolLog: Array<{ direction: 'request' | 'response'; payload: unknown; at: string }>;
  addProtocolEntry: (direction: 'request' | 'response', payload: unknown) => void;
  clearProtocol: () => void;
}

const PlaygroundContext = React.createContext<PlaygroundContextValue | null>(null);

export function PlaygroundProvider({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const [mcpSessionId, setMcpSessionId] = React.useState('');
  const [transcript, setTranscript] = React.useState<TranscriptItem[]>([]);
  const [lastRawMcp, setLastRawMcp] = React.useState('');
  const [protocolLog, setProtocolLog] = React.useState<Array<{ direction: 'request' | 'response'; payload: unknown; at: string }>>([]);

  const append = React.useCallback((role: TranscriptItem['role'], text: string, meta?: Record<string, unknown>) => {
    setTranscript((existing) => [...existing, { role, text, at: new Date().toISOString(), meta }]);
  }, []);

  const clearTranscript = React.useCallback(() => {
    setTranscript([]);
  }, []);

  const addProtocolEntry = React.useCallback((direction: 'request' | 'response', payload: unknown) => {
    setProtocolLog((existing) => [...existing, { direction, payload, at: new Date().toISOString() }]);
  }, []);

  const clearProtocol = React.useCallback(() => {
    setProtocolLog([]);
  }, []);

  const value = React.useMemo<PlaygroundContextValue>(
    () => ({
      token,
      tokenMissing: !token.trim(),
      mcpSessionId,
      setMcpSessionId,
      transcript,
      append,
      clearTranscript,
      lastRawMcp,
      setLastRawMcp,
      protocolLog,
      addProtocolEntry,
      clearProtocol,
    }),
    [token, mcpSessionId, transcript, append, clearTranscript, lastRawMcp, protocolLog, addProtocolEntry, clearProtocol],
  );

  return <PlaygroundContext.Provider value={value}>{children}</PlaygroundContext.Provider>;
}

export function usePlayground(): PlaygroundContextValue {
  const value = React.useContext(PlaygroundContext);
  if (!value) {
    throw new Error('usePlayground must be used within PlaygroundProvider');
  }
  return value;
}

export type { TranscriptItem };
