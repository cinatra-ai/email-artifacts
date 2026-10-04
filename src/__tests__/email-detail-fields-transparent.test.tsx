import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

import EmailArtifactsDetail from "../renderers/detail";
import { bodyProps, editableTitleEdit, readOnlyEdit } from "./email-detail-fixtures";

// THE TWO FIELDS CARRY NO FILL OF THEIR OWN (cinatra#3887). On the artifact's
// own page the subject field and the body editor each carry an inline
// transparent background beside their `bg-transparent` class, so they read the
// same way in both palettes; every form control of the editable pane is one of
// those two, and the read-only pane draws no form control and no fill.

const FORM_CONTROLS = "input, textarea, select, [contenteditable]";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function regionOf(container: HTMLElement, region: string): HTMLElement {
  const node = container.querySelector(`[data-region="${region}"]`) as HTMLElement | null;
  expect(node).not.toBeNull();
  return node as HTMLElement;
}

describe("the email fields carry no fill of their own", () => {
  it("F1 the subject field carries no fill of its own", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    const subject = regionOf(container, "subject-editor");
    expect(subject.style.backgroundColor).toBe("transparent");
    expect(subject.className.split(/\s+/u)).toContain("bg-transparent");
  });

  it("F2 the body editor carries no fill of its own", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    const body = regionOf(container, "body-editor");
    expect(body.style.backgroundColor).toBe("transparent");
    expect(body.className.split(/\s+/u)).toContain("bg-transparent");
  });

  it("F3 every form control of the editable pane carries no fill of its own", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    const controls = Array.from(container.querySelectorAll<HTMLElement>(FORM_CONTROLS));
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(["subject-editor", "body-editor"]).toContain(control.getAttribute("data-region"));
      expect(control.style.backgroundColor).toBe("transparent");
    }
  });

  it("F4 the read-only pane draws no form control and no fill", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: readOnlyEdit })} />);
    expect(container.querySelectorAll(FORM_CONTROLS)).toHaveLength(0);
    for (const region of ["subject", "body"]) {
      const classes = regionOf(container, region).className.split(/\s+/u);
      expect(classes.filter((name) => name.startsWith("bg-"))).toEqual([]);
    }
  });
});
