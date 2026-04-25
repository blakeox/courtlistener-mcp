export const HOSTED_AI_CLIENT_ORIGINS = [
  'https://chatgpt.com',
  'https://chat.openai.com',
  'https://claude.ai',
  'https://claude.com',
] as const;

export function mergeHostedAiClientOrigins(configuredOrigins?: readonly string[] | null): string[] {
  const baseOrigins = configuredOrigins ? [...configuredOrigins] : [];
  if (baseOrigins.includes('*')) {
    return baseOrigins;
  }

  const allowed = [...baseOrigins];
  for (const origin of HOSTED_AI_CLIENT_ORIGINS) {
    if (!allowed.includes(origin)) {
      allowed.push(origin);
    }
  }
  return allowed;
}
