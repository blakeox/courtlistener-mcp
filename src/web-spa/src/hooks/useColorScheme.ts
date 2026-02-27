import React from 'react';

type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'clmcp_color_scheme';

function getSystemPreference(): ColorScheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredPreference(): ColorScheme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage not available
  }
  return null;
}

export function useColorScheme(): {
  scheme: ColorScheme;
  toggle: () => void;
  isSystem: boolean;
} {
  const [userPref, setUserPref] = React.useState<ColorScheme | null>(() => getStoredPreference());
  const [systemPref, setSystemPref] = React.useState<ColorScheme>(() => getSystemPreference());

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPref(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const scheme = userPref ?? systemPref;

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', scheme);
  }, [scheme]);

  const toggle = React.useCallback(() => {
    const next = scheme === 'light' ? 'dark' : 'light';
    setUserPref(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage not available
    }
  }, [scheme]);

  return { scheme, toggle, isSystem: userPref === null };
}
