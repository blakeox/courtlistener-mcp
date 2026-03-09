export interface AuthStartReturnTarget {
  value: string;
  isExplicit: boolean;
}

export function resolveAuthStartReturnTarget(raw: string | null): AuthStartReturnTarget {
  const value = (raw || '').trim();
  if (!value) {
    return { value: '/', isExplicit: false };
  }
  if (value.startsWith('/')) {
    return { value, isExplicit: true };
  }
  try {
    return { value: new URL(value).toString(), isExplicit: true };
  } catch {
    return { value: '/', isExplicit: true };
  }
}
