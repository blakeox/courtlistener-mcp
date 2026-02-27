import { describe, it, expect } from 'vitest';

describe('Vitest SPA setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });

  it('has jsdom environment', () => {
    expect(typeof document).toBe('object');
    expect(typeof window).toBe('object');
  });
});
