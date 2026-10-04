import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import EmailArtifactsDetail from "../renderers/detail";
import { bodyProps } from "./email-detail-fixtures";

// cinatra#3888: the road from a stored document to markup is one module.
// The arms pin that only src/renderers/email-body-html.tsx reaches the shared
// sanitizer and writes html into the page (once), that the suite names that
// module and this guard as security-bearing instead of the view and the
// display, and that the body still draws a heading one level down in the same
// element with the same class.

afterEach(() => cleanup());

// The vitest root is this package, so the clone is one resolve away.
const root = resolve(process.cwd());
const SANITIZER_IMPORT = "@cinatra-ai/sdk-extensions/markdown-sanitizer";
const HTML_WRITE = "dangerouslySetInnerHTML";
const HTML_MODULE = "src/renderers/email-body-html.tsx";
const GUARD = "src/__tests__/email-body-html-road.test.tsx";

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === join(root, "src", "__tests__")) continue;
      walkSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(relative(root, full).split(sep).join("/"));
    }
  }
  return acc;
}

const sourceFiles = walkSourceFiles(join(root, "src")).sort();
const text = (path: string) => readFileSync(resolve(root, path), "utf8");
const filesNaming = (needle: string) => sourceFiles.filter((path) => text(path).includes(needle));

const region = (name: string) => document.querySelector(`[data-region="${name}"]`);

describe("the email body's html road", () => {
  it("only the html module reaches the shared sanitizer", () => {
    expect(filesNaming(SANITIZER_IMPORT)).toEqual([HTML_MODULE]);
  });

  it("only the html module writes html into the page, and only once", () => {
    expect(filesNaming(HTML_WRITE)).toEqual([HTML_MODULE]);
    expect(text(HTML_MODULE).split(HTML_WRITE).length - 1).toBe(1);
  });

  it("the suite names the html module and its guard, and no longer the view or the display", () => {
    const suite = JSON.parse(text(".github/gate-suite.json"));
    const paths: string[] = suite.highRiskPaths;
    expect(paths).toContain(HTML_MODULE);
    expect(paths).toContain(GUARD);
    expect(paths).not.toContain("src/renderers/email-detail-view.ts");
    expect(paths).not.toContain("src/renderers/detail.tsx");
  });

  it("draws a heading one level down, exactly as today", () => {
    render(
      <EmailArtifactsDetail {...bodyProps({ markdown: "# Pilot notes\n\nFollowing up on the pilot." })} />,
    );
    const body = region("body") as HTMLElement;
    expect(body).toBeTruthy();
    expect(body.querySelector("h1")).toBeNull();
    const headings = body.querySelectorAll("h2");
    expect(headings.length).toBe(1);
    expect(headings[0]?.textContent).toBe("Pilot notes");
  });

  it("draws the body in the same element, exactly as today", () => {
    render(<EmailArtifactsDetail {...bodyProps()} />);
    const body = region("body") as HTMLElement;
    expect(body.textContent).toContain("following up on the pilot");
    expect(body.tagName).toBe("DIV");
    expect(body.getAttribute("class")).toBe(
      "text-sm leading-relaxed text-foreground [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0",
    );
  });
});
