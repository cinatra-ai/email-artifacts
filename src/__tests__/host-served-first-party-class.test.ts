// The repository's vendored `extension-kind-gate.mjs` must classify the
// host-shared primitives module id as the HOST-SERVED first-party class, not as
// a non-SDK first-party coupling.
//
// The gate is a MIRROR of the cinatra monorepo's canonical
// `scripts/extensions/inventory.mjs`, which carries the class:
//
//   export const HOST_SERVED_PACKAGES = new Set([HOST_DESIGN_PRIMITIVES_MODULE]);
//   ...
//   if (HOST_SERVED_PACKAGES.has(base)) return false; // served by the host at run time
//
// Without the mirrored class the renderers' `@cinatra-ai/design-primitives`
// imports fail this repository's own `kind-gates` check, a required context.
import { describe, expect, it } from "vitest";

import {
  HOST_SERVED_PACKAGES,
  SDK_PACKAGES,
  isSdkOnlyViolation,
} from "../../extension-kind-gate.mjs";

const SHARED_MODULE = "@cinatra-ai/design-primitives";

describe("extension-kind-gate host-served first-party class", () => {
  it("carries exactly the host-shared primitives module id in its own class", () => {
    expect([...HOST_SERVED_PACKAGES]).toEqual([SHARED_MODULE]);
    // The class is DISTINCT from the SDK class: the id is not an SDK package.
    expect(SDK_PACKAGES.has(SHARED_MODULE)).toBe(false);
  });

  it("does not report the host-served id as a non-SDK first-party dependency", () => {
    expect(isSdkOnlyViolation(SHARED_MODULE)).toBe(false);
    // A subpath collapses to the base package, exactly as in the SDK class.
    expect(isSdkOnlyViolation(`${SHARED_MODULE}/button`)).toBe(false);
  });

  it("still reports a first-party package the host does not serve", () => {
    expect(isSdkOnlyViolation("@cinatra-ai/agents")).toBe(true);
    expect(isSdkOnlyViolation("@cinatra-ai/objects")).toBe(true);
    // A near-miss of the id is not served.
    expect(isSdkOnlyViolation("@cinatra-ai/design-primitives-x")).toBe(true);
    expect(isSdkOnlyViolation("@cinatra-ai/Design-Primitives")).toBe(true);
  });

  it("keeps the SDK class and the out-of-scope cases unchanged", () => {
    expect(isSdkOnlyViolation("@cinatra-ai/sdk-ui/field-renderer-props")).toBe(false);
    expect(isSdkOnlyViolation("@cinatra-ai/sdk-extensions")).toBe(false);
    expect(isSdkOnlyViolation("react")).toBe(false);
    expect(isSdkOnlyViolation("@other-scope/design-primitives")).toBe(false);
  });
});
