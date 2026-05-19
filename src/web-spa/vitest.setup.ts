import '@testing-library/jest-dom/vitest';
import { toHaveNoViolations } from 'vitest-axe/matchers';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

expect.extend({ toHaveNoViolations });

afterEach(() => {
  cleanup();
});
