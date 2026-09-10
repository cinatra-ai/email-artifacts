import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { emailArtifactsManifest } from "../index";
import { EMAIL_DISPLAY_PROPS_API_VERSION } from "../renderers/email-detail-contract";

// THE MANIFEST OF RECORD is package.json. This suite reads it from disk — never
// through an import that a bundler could resolve to something else — and holds
// it to what the pack declares: the display is registered for the pack's OWN
// object types, it adds NO content-form registration, it declares its props
// version, and its entry is reachable through the package's `exports` map.

// The vitest root is this package, so the manifest of record is one resolve away.
const manifestPath = resolve(process.cwd(), "package.json");
const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));

describe("the display's manifest declaration", () => {
  it("reads this pack's own manifest, and no other", () => {
    expect(pkg.name).toBe("@cinatra-ai/email-artifacts");
  });

  it("declares the detail slot with its entry and its props version", () => {
    const detail = pkg.cinatra.artifact.ui.renderers.detail;
    expect(detail.entry).toBe("./src/renderers/detail.tsx");
    expect(detail.propsApiVersion).toBe(EMAIL_DISPLAY_PROPS_API_VERSION);
  });

  it("registers NO content form for the display — the type is what it is declared for", () => {
    const detail = pkg.cinatra.artifact.ui.renderers.detail;
    // `representations` is the content-form binding a display declares; a
    // type-owned display carries none, exactly as the `listRow` slot does.
    expect(detail).not.toHaveProperty("representations");
    expect(Object.keys(detail).sort()).toEqual(["entry", "propsApiVersion"]);
    // The pack's pre-existing bytes-only matcher registration is untouched.
    expect(pkg.cinatra.artifact.accepts.file.mimeTypes).toEqual(["text/markdown", "text/plain"]);
  });

  it("declares the body type it is drawn for, and the two record types beside it", () => {
    const types = pkg.cinatra.artifact.objectTypes.map((t: { type: string }) => t.type);
    expect(types).toContain("@cinatra-ai/email:body");
    expect(types).toContain("@cinatra-ai/email:sent-email");
    expect(types).toContain("@cinatra-ai/email:received-reply");
  });

  it("adds the display's exports entry so the host can import it by path", () => {
    expect(pkg.exports["./src/renderers/detail"]).toBe("./src/renderers/detail.tsx");
  });

  it("keeps the typed manifest and the manifest of record in lockstep", () => {
    // BOTH SIDES CARRY THE DECLARATION, and they carry the same one: two
    // undefined slots are not lockstep, they are a display nobody declared.
    expect(emailArtifactsManifest.ui?.renderers?.detail).toBeDefined();
    expect(pkg.cinatra.artifact.ui.renderers.detail).toBeDefined();
    expect(emailArtifactsManifest.ui?.renderers?.detail).toEqual(
      pkg.cinatra.artifact.ui.renderers.detail,
    );
    expect(emailArtifactsManifest.ui?.renderers?.listRow).toEqual(
      pkg.cinatra.artifact.ui.renderers.listRow,
    );
  });
});
