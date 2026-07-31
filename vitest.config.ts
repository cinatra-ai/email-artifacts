import { defineConfig } from "vitest/config";

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
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**"],
  },
});
