import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Validator } from "@cfworker/json-schema";

import { emailArtifactsManifest } from "../index";

// cinatra#3089: the recipient claim declares the record identity under the
// keyword x-cinatra-identity. I1-I3 pin the declaration in both files; V1-V3
// pin that the host's validator still accepts a contact with no address.

const RECIPIENT_TYPE = "@cinatra-ai/email:recipient";
const KEYWORD = "x-cinatra-identity";

const manifestPath = resolve(process.cwd(), "package.json");
const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));

function recipientClaim(objectTypes: Array<{ type: string; schema?: Record<string, any> }>) {
  return objectTypes.find((t) => t.type === RECIPIENT_TYPE);
}

const claim = recipientClaim(pkg.cinatra.artifact.objectTypes);
const typed = recipientClaim(
  (emailArtifactsManifest.objectTypes ?? []) as Array<{ type: string; schema?: Record<string, any> }>,
);

describe("the recipient claim's identity declaration", () => {
  it("declares the run and the contact key as the record identity", () => {
    expect(claim?.schema?.[KEYWORD]).toEqual(["runId", "contactKey"]);
  });

  it("the declaration is well-formed by the application's rule", () => {
    const value = claim?.schema?.[KEYWORD];
    expect(Array.isArray(value)).toBe(true);
    expect(value.length).toBeGreaterThanOrEqual(1);
    for (const entry of value) {
      expect(typeof entry).toBe("string");
      expect(Object.hasOwn(claim?.schema?.properties ?? {}, entry)).toBe(true);
    }
    expect(new Set(value).size).toBe(value.length);
  });

  it("the typed manifest declares the same identity", () => {
    expect(typed?.schema?.[KEYWORD]).toEqual(["runId", "contactKey"]);
  });
});

describe("the host's validator on the recipient claim", () => {
  const shipped = claim?.schema as Record<string, unknown>;
  const { [KEYWORD]: _omitted, ...without } = shipped;
  const withKeyword = new Validator(shipped as any);
  const withoutKeyword = new Validator(without as any);

  const noAddress = { runId: "run-1", contactKey: "contact:c-2", campaignId: "camp-1", confirmed: true };
  const addressOnly = { runId: "run-1", email: "ann@example.org" };
  const noIdentity = { runId: "run-1" };
  const emptyKey = { runId: "run-1", contactKey: "" };
  const noRun = { contactKey: "contact:c-2" };

  it("the host's validator accepts a contact with no address", () => {
    expect(Object.hasOwn(noAddress, "email")).toBe(false);
    expect(withKeyword.validate(noAddress).valid).toBe(true);
  });

  it("it still accepts an address alone and refuses a record with neither, an empty contact key or no run", () => {
    expect(withKeyword.validate(addressOnly).valid).toBe(true);
    expect(withKeyword.validate(noIdentity).valid).toBe(false);
    expect(withKeyword.validate(emptyKey).valid).toBe(false);
    expect(withKeyword.validate(noRun).valid).toBe(false);
  });

  it("the identity declaration changes no validation outcome", () => {
    expect(Object.hasOwn(without, KEYWORD)).toBe(false);
    for (const record of [noAddress, addressOnly, noIdentity, emptyKey, noRun]) {
      expect(withKeyword.validate(record).valid).toBe(withoutKeyword.validate(record).valid);
    }
  });
});
