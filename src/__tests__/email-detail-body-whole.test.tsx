import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

import EmailArtifactsDetail from "../renderers/detail";
import { bodyProps, editableEdit } from "./email-detail-fixtures";

// THE PANE DRAWS THE BODY WHOLE (cinatra#3089): on the artifact's own page the
// editor holding the body stands as tall as the words it holds, grows with the
// words the reader adds, and keeps no scroll of its own and no resize handle.
// The test document lays nothing out, so each arm answers the editor's scroll
// height in the browser's place.

let measured = 0;

beforeEach(() => {
  measured = 0;
  vi.useFakeTimers();
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => measured,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

afterEach(() => {
  cleanup();
  delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function editorOf(container: HTMLElement): HTMLTextAreaElement {
  const editor = container.querySelector('[data-region="body-editor"]') as HTMLTextAreaElement | null;
  expect(editor).toBeTruthy();
  return editor as HTMLTextAreaElement;
}

describe("the body on the artifact's own page is drawn whole", () => {
  it("opens the editor as tall as the stored body", () => {
    measured = 1180;
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    expect(editorOf(container).style.height).toBe("1180px");
  });

  it("grows with the words the reader adds", () => {
    measured = 400;
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    const editor = editorOf(container);
    expect(editor.style.height).toBe("400px");
    measured = 720;
    fireEvent.change(editor, { target: { value: `${editor.value}\n\nHappy to share the notes.` } });
    expect(editor.style.height).toBe("720px");
  });

  it("keeps no scroll of its own and no resize handle", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    const classes = editorOf(container).className.split(/\s+/u);
    expect(classes).toContain("overflow-hidden");
    expect(classes).toContain("resize-none");
    expect(classes).not.toContain("resize-y");
  });
});
