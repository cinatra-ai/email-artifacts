// The host-shared primitives module id must RESOLVE for this package's own test
// run, and serve every name the renderers import.
//
// `@cinatra-ai/design-primitives` is VIRTUAL: no package is published under it.
// Inside the host it resolves through the host's own `compilerOptions.paths`
// onto `src/lib/artifacts/host-shared-primitives.ts` (the contract's BUILD-TIME
// road, which the host build of these renderers takes). A vitest run has no such
// mapping, so this package's vitest alias (vitest.config.ts) points the id at
// the test-only double under tests/doubles/, in this repository alone and in
// the host's materialized extension tree alike.
//
// This file is separate from no-product-primitive-copies.test.ts: an
// unresolvable specifier fails at transform time and would take that file's
// source-fact assertions down with it instead of reporting them one by one.
import { describe, expect, it } from "vitest";

const NAMES = [
  "Button",
  "Checkbox",
  "Field",
  "FieldLabel",
  "Input",
  "InputGroup",
  "InputGroupAddon",
  "InputGroupInput",
  "Label",
  "Select",
  "SelectContent",
  "SelectItem",
  "SelectTrigger",
  "SelectValue",
  "Textarea",
] as const;

describe("@cinatra-ai/design-primitives in this package's test run", () => {
  it("resolves and serves the fifteen names the renderers import", async () => {
    const shared = (await import("@cinatra-ai/design-primitives")) as Record<string, unknown>;
    const served = Object.fromEntries(
      NAMES.map((name) => {
        const value = shared[name];
        const ok = typeof value === "function" || (typeof value === "object" && value !== null);
        return [name, ok];
      }),
    );
    expect(served).toEqual(Object.fromEntries(NAMES.map((name) => [name, true])));
  });
});
