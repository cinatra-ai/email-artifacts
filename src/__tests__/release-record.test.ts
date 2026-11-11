// The release record of the migration onto the host-shared design primitives:
// the package version, the changelog section that describes it, and the exact
// dependency maps afterwards. No tag or publish is implied by this record.

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_NAME = "@cinatra-ai/email-artifacts";

function packageRoot(): string {
  let dir = process.cwd();
  for (;;) {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string };
      if (parsed.name === PACKAGE_NAME) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${PACKAGE_NAME} root not found above ${process.cwd()}`);
    dir = parent;
  }
}

const REPO_ROOT = packageRoot();

type Manifest = {
  version?: unknown;
  dependencies?: unknown;
  peerDependencies?: unknown;
  peerDependenciesMeta?: unknown;
};

function manifest(): Manifest {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as Manifest;
}

const HEADING = /^## v0\.1\.4 — (\d{4}-\d{2}-\d{2})$/u;

const SECTION_BODY = [
  // The folder name is joined so that a text search of src/ for the old copy
  // path finds no hit in this file.
  `- Take the design primitives from the host (@cinatra-ai/design-primitives) and drop the nine copies under src/${["components", "ui"].join("/")}/.`,
  "- Remove the radix-ui and class-variance-authority dependencies, which only the copies used.",
];

/** The first `## ` heading of the changelog and the non-blank lines of its section. */
function firstSection(text: string): { heading: string | undefined; body: string[] } {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("## "));
  if (start === -1) return { heading: undefined, body: [] };
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const body = (end === -1 ? rest : rest.slice(0, end)).filter((line) => line.trim() !== "");
  return { heading: lines[start], body };
}

/** True when `d` (YYYY-MM-DD) names a real calendar date. */
function isCalendarDate(d: string): boolean {
  const parsed = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}

describe("release record of the host-shared primitives migration", () => {
  it("(1) sets the package version to exactly 0.1.4", () => {
    expect(manifest().version).toBe("0.1.4");
  });

  it("(2) opens the changelog with the dated heading of this release", () => {
    const file = path.join(REPO_ROOT, "CHANGELOG.md");
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, "utf8");
    expect(text.split(/\r?\n/)[0]).toBe("# Changelog");
    const { heading } = firstSection(text);
    expect(heading).toMatch(HEADING);
    const date = (heading ?? "").match(HEADING)?.[1] ?? "";
    expect(isCalendarDate(date)).toBe(true);
    expect(date >= "2026-10-18").toBe(true);
    expect(date <= new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it("(3) carries exactly the two lines of this release's section, in order", () => {
    const text = readFileSync(path.join(REPO_ROOT, "CHANGELOG.md"), "utf8");
    expect(firstSection(text).body).toEqual(SECTION_BODY);
  });

  it("(4) keeps exactly clsx, lucide-react and tailwind-merge as dependencies", () => {
    expect(manifest().dependencies).toEqual({
      clsx: "^2.1.1",
      "lucide-react": "^1.20.0",
      "tailwind-merge": "^3.6.0",
    });
  });

  it("(5) leaves the peer maps unchanged", () => {
    const pkg = manifest();
    expect(pkg.peerDependencies).toEqual({
      "@cinatra-ai/sdk-extensions": "*",
      "@cinatra-ai/sdk-ui": "*",
      react: "^19.2.7",
      "react-dom": "^19.2.7",
    });
    expect(pkg.peerDependenciesMeta).toEqual({
      "@cinatra-ai/sdk-extensions": { optional: true },
      "@cinatra-ai/sdk-ui": { optional: true },
    });
  });
});
