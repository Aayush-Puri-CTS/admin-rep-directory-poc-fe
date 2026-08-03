// Pulls in @testing-library/jest-dom's ambient `declare module 'vitest'` augmentation
// (adds matchers like toBeInTheDocument/toHaveClass to vitest's `expect`) for every file
// under tsconfig.app.json's "src" program, not just the vitest.setup.ts file that actually
// registers it at runtime — see vitest.setup.ts.
import '@testing-library/jest-dom/vitest';
