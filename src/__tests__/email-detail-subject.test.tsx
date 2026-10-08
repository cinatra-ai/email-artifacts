import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARTIFACT_EDIT_IDLE_PAUSE_MS } from "@cinatra-ai/sdk-extensions/artifact-edit-channel";

import EmailArtifactsDetail from "../renderers/detail";
import { EMAIL_DISPLAY_PROPS_API_VERSION } from "../renderers/email-detail-contract";
import {
  bodyProps,
  editableEdit,
  editableEditV1,
  editableTitleEdit,
  readOnlyEdit,
  REVISION_ID,
} from "./email-detail-fixtures";

// THE SUBJECT, EDITED IN PLACE (cinatra#3814). On the artifact's own page the
// subject takes an edit in the pane itself, exactly as the body does, and a
// subject change crosses the host's generic edit channel as a TITLE change: its
// own field beside the text, one capability, one base, one save address. A
// capability that does not admit the title — the older channel version, or a
// newer one that names no title field — keeps the subject drawn as text.

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
  vi.restoreAllMocks();
});

async function settle(ms = ARTIFACT_EDIT_IDLE_PAUSE_MS + 50) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const subjectEditorOf = (root: HTMLElement) =>
  root.querySelector('[data-region="subject-editor"]') as HTMLInputElement | null;
const bodyEditorOf = (root: HTMLElement) =>
  root.querySelector('[data-region="body-editor"]') as HTMLTextAreaElement | null;
const indicatorOf = (root: HTMLElement) =>
  root.querySelector('[data-region="saving-indicator"]') as HTMLElement | null;
const sentBodies = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));

describe("the subject on the artifact's own page", () => {
  it("T1 draws the subject as a field in its own place, beside the body's editor", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    const subject = subjectEditorOf(container);
    expect(subject).not.toBeNull();
    expect(subject!.tagName).toBe("INPUT");
    expect(subject!.getAttribute("aria-label")).toBe("Subject");
    expect(subject!.value).toBe("Re-connecting on Q3 priorities");
    // No edit mode to enter and no Save button to find.
    expect(container.querySelector("button")).toBeNull();
    const editable = Array.from(container.querySelectorAll("input, textarea, select, [contenteditable]"));
    expect(editable.map((node) => node.getAttribute("data-region"))).toEqual([
      "subject-editor",
      "body-editor",
    ]);
  });

  it("T2 sends a subject change as ONE title change, with no text, and reads Saved", async () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(subjectEditorOf(container)!, { target: { value: "A new subject" } });
    expect(indicatorOf(container)?.textContent).toContain("Saving");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(editableTitleEdit.kind === "editable" ? editableTitleEdit.saveUrl : "");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      channelVersion: 2,
      baseRevisionId: REVISION_ID,
      field: "title",
      title: "A new subject",
    });
    expect(body).not.toHaveProperty("text");
    expect(indicatorOf(container)?.textContent).toBe("Saved");
  });

  it("T3 sends a body change as ONE text change, with no title", async () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(bodyEditorOf(container)!, { target: { value: "A shorter note." } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = sentBodies(fetchMock)[0];
    expect(body).toHaveProperty("text");
    expect(body.text).toContain("A shorter note.");
    expect(body).not.toHaveProperty("title");
    expect(body.field).not.toBe("title");
  });

  it("T4 reloads the subject and the body onto the newer revision a stale answer names", async () => {
    fetchMock.mockImplementationOnce(async () =>
      answer({
        outcome: "stale",
        latestRevisionId: "rev_newer",
        latestRevision: 7,
        text: "The newer revision's words.",
        truncated: false,
        title: "Their subject",
      }),
    );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(subjectEditorOf(container)!, { target: { value: "A new subject" } });
    await settle();
    expect(subjectEditorOf(container)!.value).toBe("Their subject");
    expect(bodyEditorOf(container)!.value).toBe("The newer revision's words.");
    expect(indicatorOf(container)?.textContent).toBe("Not saved — newer revision loaded");

    fireEvent.change(subjectEditorOf(container)!, { target: { value: "A new subject" } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBodies(fetchMock)[1]).toMatchObject({
      baseRevisionId: "rev_newer",
      field: "title",
      title: "A new subject",
    });
  });

  it("T5 sends a subject change and a body change one after the other, never two in flight", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          gate.release = () => done(answer({ outcome: "saved", revisionId: "rev_9", revision: 9 }));
        }),
    );
    fetchMock.mockImplementationOnce(async () =>
      answer({ outcome: "saved", revisionId: "rev_10", revision: 10 }),
    );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(subjectEditorOf(container)!, { target: { value: "A new subject" } });
    fireEvent.change(bodyEditorOf(container)!, { target: { value: "A shorter note." } });
    await settle();
    // The title goes first, against the opened revision, and the text waits.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBodies(fetchMock)[0]).toMatchObject({
      baseRevisionId: REVISION_ID,
      field: "title",
      title: "A new subject",
    });
    expect(gate.release).not.toBeNull();
    await act(async () => {
      gate.release!();
    });
    await settle(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = sentBodies(fetchMock)[1];
    expect(second.baseRevisionId).toBe("rev_9");
    expect(second.text).toContain("A shorter note.");
    expect(second).not.toHaveProperty("title");
    expect(indicatorOf(container)?.textContent).toBe("Saved");
  });

  it("T9 never reads Saved while a refused subject or body change is still on screen", async () => {
    fetchMock.mockImplementationOnce(async () => answer({ outcome: "refused", reason: "over-cap" }));
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(subjectEditorOf(container)!, { target: { value: "A new subject" } });
    fireEvent.change(bodyEditorOf(container)!, { target: { value: "A shorter note." } });
    await settle();
    await settle(0);
    // The title was refused, the text then stored: the subject is still unsaved.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(indicatorOf(container)?.textContent).toBe("Not saved");

    // Once the subject is stored again, the pane reads Saved.
    fireEvent.change(subjectEditorOf(container)!, { target: { value: "Their subject" } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(indicatorOf(container)?.textContent).toBe("Saved");
  });

  it("T6 keeps the subject as text where the capability does not admit the title", () => {
    for (const edit of [editableEditV1, editableEdit]) {
      const { container, unmount } = render(<EmailArtifactsDetail {...bodyProps({ edit })} />);
      const subject = container.querySelector('[data-region="subject"]') as HTMLElement;
      expect(subject).not.toBeNull();
      expect(subject.tagName).toBe("P");
      expect(subject.textContent).toBe("Re-connecting on Q3 priorities");
      expect(subject.querySelector("input, textarea, select, [contenteditable]")).toBeNull();
      expect(subjectEditorOf(container)).toBeNull();
      expect(bodyEditorOf(container)).not.toBeNull();
      unmount();
    }
  });

  it("T7 draws neither editor where the artifact is a review target", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: readOnlyEdit })} />);
    expect(subjectEditorOf(container)).toBeNull();
    expect(bodyEditorOf(container)).toBeNull();
    const subject = container.querySelector('[data-region="subject"]') as HTMLElement;
    expect(subject.tagName).toBe("P");
    expect(subject.textContent).toBe("Re-connecting on Q3 priorities");
  });

  it("T8 declares props contract version 5, and a snapshot at version 4 draws the pane", () => {
    expect(EMAIL_DISPLAY_PROPS_API_VERSION).toBe(5);
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.cinatra.artifact.ui.renderers.detail.propsApiVersion).toBe(5);
    const { container } = render(
      <EmailArtifactsDetail {...{ ...bodyProps({ edit: editableTitleEdit }), propsApiVersion: 4 }} />,
    );
    expect(container.querySelector('[data-region="pane"]')).not.toBeNull();
    expect(container.querySelector('[data-region="floor"]')).toBeNull();
  });
});
