// The migration of this package onto the HOST-SHARED design primitives
// (`@cinatra-ai/design-primitives`), pinned as SOURCE facts.
//
// The host-shared primitives contract's recipe for a migrating package:
//
//   1. package.json: do not declare `@cinatra-ai/design-primitives` as a
//      dependency or a peer. The id is VIRTUAL; any specifier (an optional peer
//      included) makes the install fail.
//   2. the imports: every copy-shaped relative import of a primitive becomes an
//      import from `@cinatra-ai/design-primitives`.
//   3. the copies: every `<item>.tsx` of the frozen list under the package's
//      `ui` components folder is deleted.
//
// The two third-party packages only the copies used (radix-ui and
// class-variance-authority) go with the copies.
//
// A regression here is silent in this repository's own CI (a source mirror
// skips install, typecheck and test), which is why these facts are pinned here
// rather than left to a type error in the host.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_NAME = "@cinatra-ai/email-artifacts";

/** The host-neutral module id the contract fixes. */
const SHARED_MODULE = "@cinatra-ai/design-primitives";

/**
 * This package's root, found by walking up from the working directory to the
 * package.json that names it (the run directory is not fixed, and
 * `import.meta.url` is not a file URL under the jsdom environment).
 */
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
const SRC = path.join(REPO_ROOT, "src");

/** Every `.ts`/`.tsx`/`.mts`/`.cts`/`.js`/`.jsx`/`.mjs` file under a directory, tests included. */
function everyFile(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...everyFile(full));
      continue;
    }
    if (/\.(m|c)?(t|j)sx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every module specifier a source file names: static `from`, side-effect
 * `import "…"`, `export … from`, dynamic `import("…")` and `require("…")`.
 */
function specifiersOf(contents: string): string[] {
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((re) => [...contents.matchAll(re)].map((m) => m[1]));
}

/** The base package of a bare specifier (`@scope/name/sub` → `@scope/name`). */
function basePackageOf(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const COPY_ONLY_PACKAGES = new Set(["radix-ui", "class-variance-authority"]);

const MANIFEST_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundleDependencies",
  "bundledDependencies",
];

function manifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

/** The names a manifest field declares, whether it is an object map or an array. */
function declaredIn(field: unknown): string[] {
  if (Array.isArray(field)) return field.filter((v): v is string => typeof v === "string");
  if (field && typeof field === "object") return Object.keys(field);
  return [];
}

/** The fifteen names the renderers take from the host-shared module, per renderer. */
const SHARED_IMPORTS: Record<string, string[]> = {
  "campaign-recipients-review.tsx": ["Button"],
  "email-drafts-review.tsx": ["Button", "Input", "Label", "Textarea"],
  "follow-up-cadence.tsx": ["Button", "Input", "Label"],
  "gmail-sender.tsx": ["Label", "Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"],
  "test-delivery-input.tsx": [
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
  ],
};

/** The names a file imports from `spec`, across every import statement naming it. */
function namesImportedFrom(contents: string, spec: string): string[] {
  const escaped = spec.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const re = new RegExp(`import\\s*(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*["']${escaped}["']`, "g");
  return [...contents.matchAll(re)]
    .flatMap((m) => m[1].split(","))
    .map((name) => name.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
    .filter((name) => name !== "")
    .sort();
}

describe("host-shared design primitives: no product-primitive copies", () => {
  it("keeps no byte copy of a product primitive in the ui components folder", () => {
    const uiDir = path.join(SRC, "components", "ui");
    expect(existsSync(uiDir) ? readdirSync(uiDir) : []).toEqual([]);
    expect(existsSync(uiDir)).toBe(false);
  });

  it("imports nothing from a ui components path in any file under src/", () => {
    const offenders: string[] = [];
    for (const file of everyFile(SRC)) {
      for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
        if (/(^|\/)components\/ui(\/|$)/.test(spec) || /^\.{1,2}\/(\.\.\/)*ui\//.test(spec)) {
          offenders.push(`${path.relative(REPO_ROOT, file)} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("imports neither radix-ui nor class-variance-authority in any file under src/", () => {
    const offenders: string[] = [];
    for (const file of everyFile(SRC)) {
      for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
        const base = basePackageOf(spec);
        if (COPY_ONLY_PACKAGES.has(base) || base.startsWith("@radix-ui/")) {
          offenders.push(`${path.relative(REPO_ROOT, file)} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares neither the virtual id nor radix-ui nor class-variance-authority in package.json", () => {
    const pkg = manifest();
    const offenders = MANIFEST_FIELDS.flatMap((field) =>
      declaredIn(pkg[field])
        .filter(
          (name) =>
            name === SHARED_MODULE ||
            COPY_ONLY_PACKAGES.has(name) ||
            name.startsWith("@radix-ui/"),
        )
        .map((name) => `${field}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  it("takes exactly its fifteen primitive names from the host-shared module, renderer by renderer", () => {
    const actual: Record<string, string[]> = {};
    for (const file of Object.keys(SHARED_IMPORTS)) {
      const contents = readFileSync(path.join(SRC, "renderers", file), "utf8");
      actual[file] = namesImportedFrom(contents, SHARED_MODULE);
    }
    const expected = Object.fromEntries(
      Object.entries(SHARED_IMPORTS).map(([file, names]) => [file, [...names].sort()]),
    );
    expect(actual).toEqual(expected);
    expect(new Set(Object.values(SHARED_IMPORTS).flat()).size).toBe(15);
  });

  it("imports the host-shared module from the renderers only", () => {
    const importers = everyFile(SRC)
      .filter((file) => !file.includes(`${path.sep}__tests__${path.sep}`))
      .filter((file) => specifiersOf(readFileSync(file, "utf8")).some((s) => basePackageOf(s) === SHARED_MODULE))
      .map((file) => path.relative(SRC, file).split(path.sep).join("/"))
      .sort();
    expect(importers).toEqual(Object.keys(SHARED_IMPORTS).map((file) => `renderers/${file}`).sort());
  });

  it("keeps the ambient declaration of the virtual id out of the host's program", () => {
    // An ambient `declare module` beats a tsconfig `paths` mapping for every
    // file of a program that reads it. The host maps the same id onto its real
    // module and serves the whole frozen export list, so the declaration must
    // sit where the host's tsconfig excludes it (`**/__tests__/fixtures/**`).
    const declaring = everyFile(SRC)
      .filter((file) => readFileSync(file, "utf8").includes(`declare module "${SHARED_MODULE}"`))
      .map((file) => path.relative(REPO_ROOT, file).split(path.sep).join("/"));
    expect(declaring).toEqual(["src/__tests__/fixtures/design-primitives.d.ts"]);
  });

  it("keeps the test double outside src/ and outside the published files", () => {
    expect(existsSync(path.join(REPO_ROOT, "tests", "doubles", "design-primitives.tsx"))).toBe(true);
    const files = manifest().files;
    expect(files).toEqual(["src", "!src/__tests__"]);
  });
});
