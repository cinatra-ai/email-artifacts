import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { emailArtifactsManifest } from "../index";

const RECIPIENT_TYPE = "@cinatra-ai/email:recipient";

const manifestPath = resolve(process.cwd(), "package.json");
const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));

function recipientClaim(objectTypes: Array<{ type: string; schema?: Record<string, any> }>) {
  return objectTypes.find((t) => t.type === RECIPIENT_TYPE);
}

// The host validates a recipient row against this claim's schema.
// This suite pins the claim's shape; it validates no row.
describe("the recipient claim", () => {
  const claim = recipientClaim(pkg.cinatra.artifact.objectTypes);

  it("requires only the run", () => {
    expect(claim?.schema?.required).toEqual(["runId"]);
  });

  it("admits an address, a non-empty contact key, or both, as the identity", () => {
    expect(claim?.schema?.anyOf).toEqual([
      { required: ["email"] },
      { required: ["contactKey"], properties: { contactKey: { minLength: 1 } } },
    ]);
  });

  it("keeps the typed manifest's recipient schema equal to the manifest of record", () => {
    const typed = recipientClaim(
      (emailArtifactsManifest.objectTypes ?? []) as Array<{ type: string; schema?: Record<string, any> }>,
    );
    expect(claim?.schema).toBeDefined();
    expect(typed?.schema).toBeDefined();
    expect(typed?.schema).toEqual(claim?.schema);
  });

  it("keeps the address and contact key declarations unchanged", () => {
    expect(claim?.schema?.properties?.email).toEqual({ type: "string", minLength: 1, pattern: "\\S" });
    expect(claim?.schema?.properties?.contactKey).toEqual({ type: "string" });
  });
});
