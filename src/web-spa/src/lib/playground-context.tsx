import React from 'react';

interface TranscriptItem {
  role: 'system' | 'user' | 'assistant' | 'error';
  text: string;
  at: string;
}

interface PlaygroundContextValue {
  token: string;
  tokenMissing: boolean;
  mcpSessionId: string;
  setMcpSessionId: (id: string) => void;
  transcript: TranscriptItem[];
  append: (role: TranscriptItem['role'], text: string) => void;
  clearTranscript: () => void;
  lastRawMcp: string;
  setLastRawMcp: (v: string) => void;
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

  const append = React.useCallback((role: TranscriptItem['role'], text: string) => {
    setTranscript((existing) => [...existing, { role, text, at: new Date().toISOString() }]);
  }, []);

  const clearTranscript = React.useCallback(() => {
    setTranscript([]);
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
    }),
    [token, mcpSessionId, transcript, append, clearTranscript, lastRawMcp],
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
