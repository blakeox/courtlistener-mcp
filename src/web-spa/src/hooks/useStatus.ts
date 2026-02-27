import React from 'react';

type StatusType = 'ok' | 'error' | 'info';

interface StatusState {
  status: string;
  statusType: StatusType;
  setOk: (msg: string) => void;
  setError: (msg: string) => void;
  setInfo: (msg: string) => void;
  clear: () => void;
}

export function useStatus(): StatusState {
  const [status, setStatus] = React.useState('');
  const [statusType, setStatusType] = React.useState<StatusType>('info');

  const setOk = React.useCallback((msg: string) => {
    setStatus(msg);
    setStatusType('ok');
  }, []);

  const setError = React.useCallback((msg: string) => {
    setStatus(msg);
    setStatusType('error');
  }, []);

  const setInfo = React.useCallback((msg: string) => {
    setStatus(msg);
    setStatusType('info');
  }, []);

  const clear = React.useCallback(() => {
    setStatus('');
    setStatusType('info');
  }, []);

  return React.useMemo(
    () => ({ status, statusType, setOk, setError, setInfo, clear }),
    [status, statusType, setOk, setError, setInfo, clear],
  );
}
