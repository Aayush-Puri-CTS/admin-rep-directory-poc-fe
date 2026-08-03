import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Vitest doesn't auto-register Testing Library's cleanup the way Jest's global
// afterEach does — do it explicitly so each test starts from an empty DOM.
afterEach(() => {
  cleanup();
});
