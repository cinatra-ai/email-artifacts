import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import EmailArtifactsListRow from "../renderers/list-row";

// The library-row glyph the pack declares at slot `listRow` (Lifecycle D W7,
// cinatra#3095). It draws one mark per claimed kind and never nothing.

afterEach(() => cleanup());

const claimed = [
  "@cinatra-ai/email:body",
  "@cinatra-ai/email:sent-email",
  "@cinatra-ai/email:received-reply",
  "@cinatra-ai/email:recipient",
];

describe("EmailArtifactsListRow (slot listRow)", () => {
  it("draws a mark for every type the pack claims", () => {
    for (const objectType of claimed) {
      const { container } = render(<EmailArtifactsListRow artifact={{ objectType }} />);
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute("data-email-glyph")).toBe(objectType);
      cleanup();
    }
  });

  it("gives the four claimed kinds four different marks", () => {
    const shapes = new Set<string>();
    for (const objectType of claimed) {
      const { container } = render(<EmailArtifactsListRow artifact={{ objectType }} />);
      shapes.add(container.querySelector("svg")?.innerHTML ?? "");
      cleanup();
    }
    expect(shapes.size).toBe(claimed.length);
  });

  it("falls back to the mail mark for an unknown type, never to nothing", () => {
    const { container } = render(
      <EmailArtifactsListRow artifact={{ objectType: "@cinatra-ai/email:unheard-of" }} />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
