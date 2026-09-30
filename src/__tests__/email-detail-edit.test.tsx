import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { ARTIFACT_EDIT_IDLE_PAUSE_MS } from "@cinatra-ai/sdk-extensions/artifact-edit-channel";

import EmailArtifactsDetail from "../renderers/detail";
import { bodyProps, editableEdit, readOnlyEdit, REVISION_ID } from "./email-detail-fixtures";

// EDIT IN PLACE, through the host's own edit channel and no other
// road: the display posts a change set to the address the capability carries,
// and it composes no address of its own.

const answer = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => answer({ outcome: "saved", revisionId: "rev_9", revision: 9 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function settle(ms = ARTIFACT_EDIT_IDLE_PAUSE_MS + 50) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("the subject and the body on the artifact's own page", () => {
  it("takes an edit of the body in the pane itself — no edit mode, no Save button", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    const editor = container.querySelector('[data-region="body-editor"]') as HTMLTextAreaElement;
    expect(editor).toBeTruthy();
    expect(editor.value).toContain("following up on the pilot");
    expect(container.querySelector("button")).toBeNull();
  });

  it("stores the change as it is made, through the capability's own address", async () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    const editor = container.querySelector('[data-region="body-editor"]') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "A shorter note." } });
    expect(container.querySelector('[data-region="saving-indicator"]')?.textContent).toContain(
      "Saving",
    );
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(editableEdit.kind === "editable" ? editableEdit.saveUrl : "");
    expect(JSON.parse(String(init.body))).toMatchObject({
      baseRevisionId: REVISION_ID,
      text: "A shorter note.",
    });
    expect(container.querySelector('[data-region="saving-indicator"]')?.textContent).toContain(
      "Saved",
    );
  });

  it("reads Not saved, never as stored, when the save does not go through", async () => {
    fetchMock.mockImplementation(async () => answer({}, false, 500));
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    const editor = container.querySelector('[data-region="body-editor"]') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "A shorter note." } });
    await settle();
    expect(container.querySelector('[data-region="saving-indicator"]')?.textContent).toContain(
      "Not saved",
    );
  });

  it("reloads onto the newer revision rather than writing over it", async () => {
    fetchMock.mockImplementation(async () =>
      answer({
        outcome: "stale",
        latestRevisionId: "rev_newer",
        latestRevision: 7,
        text: "The newer revision's words.",
        truncated: false,
      }),
    );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    const editor = container.querySelector('[data-region="body-editor"]') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "A shorter note." } });
    await settle();
    expect(
      (container.querySelector('[data-region="body-editor"]') as HTMLTextAreaElement).value,
    ).toBe("The newer revision's words.");
  });

  it("is drawn read only where the artifact is a review target", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: readOnlyEdit })} />);
    expect(container.querySelector('[data-region="body-editor"]')).toBeNull();
    expect(container.querySelector('[data-region="saving-indicator"]')).toBeNull();
    expect(container.querySelector('[data-region="body"]')?.textContent).toContain(
      "following up on the pilot",
    );
  });

  it("offers no edit of the subject where the capability does not admit the title", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    const subject = container.querySelector('[data-region="subject"]') as HTMLElement;
    // NO EDITABLE CONTROL OF ANY SHAPE over the subject — not a textarea, not a
    // single-line input, not a contenteditable region. `editableEdit` names no
    // title field, so this capability admits the text alone; the pane therefore
    // offers no affordance that suggests a title road it was not handed.
    expect(subject.tagName).not.toBe("TEXTAREA");
    expect(subject.tagName).not.toBe("INPUT");
    expect(subject.getAttribute("contenteditable")).toBeNull();
    expect(subject.querySelector("input, textarea, select, [contenteditable]")).toBeNull();
    // The ONE editable region in the pane is the body's editor.
    const editable = Array.from(container.querySelectorAll("input, textarea, [contenteditable]"));
    expect(editable).toHaveLength(1);
    expect(editable[0]!.getAttribute("data-region")).toBe("body-editor");
  });

  it("never edits a text the channel had to cut", () => {
    const { container } = render(
      <EmailArtifactsDetail {...bodyProps({ edit: editableEdit, truncated: true })} />,
    );
    expect(container.querySelector('[data-region="body-editor"]')).toBeNull();
  });
});
