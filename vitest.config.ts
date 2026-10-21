import { defineConfig } from "vitest/config";
import * as path from "node:path";
import { createRequire } from "node:module";

// Package-local test config. Without it, running `vitest` from this package
// inside the cinatra monorepo layout (extensions/cinatra-ai/<slug>/) walks UP
// and loads the HOST ROOT vitest.config.ts. That config's `include` happens to
// match `src/__tests__/**`, so the files WERE collected — but under the host
// root's node environment, and every renderer test here mounts real DOM via
// @testing-library/react. Result: 29 of 57 tests died with
// `ReferenceError: document is not defined` (cinatra#2288).
//
// jsdom is therefore the correct environment for this pack: it ships artifact
// FIELD RENDERERS (src/renderers/**) — React client components asserted
// through render()/screen. The JSX transform is taken from this package's own
// tsconfig ("jsx": "react-jsx").

// `@cinatra-ai/design-primitives` is the host-shared primitives module. Its id
// is VIRTUAL: the contract publishes no package under it and forbids declaring
// it as a dependency or a peer; the host build resolves it for these renderers
// through its own `compilerOptions.paths`. A vitest run has no such mapping, in
// this repository alone and in the host's materialized extension tree alike, so
// the id is aliased to the test-only double under tests/doubles/ (outside src/,
// never package source) — and only while the id does not resolve.
const doubles = path.join(__dirname, "tests/doubles");
const require = createRequire(import.meta.url);

function resolvableOrStub(specifier: string, stubFile: string, stubDir: string) {
  try {
    require.resolve(specifier);
    return null;
  } catch {
    return { find: specifier, replacement: path.join(stubDir, stubFile) };
  }
}

const alias = [
  resolvableOrStub("@cinatra-ai/design-primitives", "design-primitives.tsx", doubles),
].filter((entry): entry is { find: string; replacement: string } => entry !== null);

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**"],
  },
  resolve: { alias },
});
