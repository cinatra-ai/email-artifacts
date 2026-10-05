import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { ARTIFACT_EDIT_IDLE_PAUSE_MS } from "@cinatra-ai/sdk-extensions/artifact-edit-channel";

import EmailArtifactsDetail from "../renderers/detail";
import { bodyProps, editableEdit, editableEditAt, editableTitleEdit, readOnlyEdit, REVISION_ID } from "./email-detail-fixtures";

// THE SAVE LIFECYCLE, over more than one change set.
//
// The edit channel's own words: "the save unit is a change set, sent after a
// short idle pause or on leaving the view, one revision per saved change set …
// takes the revision the editor opened as its base, so a save over a newer
// revision is refused and the editor reloads rather than overwriting … saves in
// flight are serialised per editor." That is a lifecycle, not a single post,
// and each case below is one way a display can hold it wrong while a single
// save still looks right.

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
    await Promise.resolve();
  });
}

const editorOf = (root: HTMLElement) =>
  root.querySelector('[data-region="body-editor"]') as HTMLTextAreaElement;
const indicatorOf = (root: HTMLElement) =>
  root.querySelector('[data-region="saving-indicator"]') as HTMLElement;
const sentBodies = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));

// A complete new host snapshot, as a refresh or another tab's save delivers it:
// the representation, content and editing capability name the same revision.
function refreshedProps(revisionId = "rev_refresh", markdown = "Stored in another tab.", title = "Refreshed subject") {
  if (editableTitleEdit.kind !== "editable") throw new Error("Expected the title grant");
  const props = bodyProps({ edit: { ...editableTitleEdit, baseRevisionId: revisionId }, markdown, title });
  if (props.content?.kind !== "text") throw new Error("Expected text content");
  if (props.representation == null) throw new Error("Expected a representation");
  return {
    ...props,
    representation: { ...props.representation, revisionId },
    content: { ...props.content, representationRevisionId: revisionId },
  };
}

const subjectOf = (root: HTMLElement) =>
  root.querySelector('[data-region="subject-editor"]') as HTMLInputElement;

describe("a refreshed revision of the same artifact", () => {
  it("retains a pending body under the text-only grant without granting title editing", async () => {
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    fireEvent.change(editorOf(container), { target: { value: "Text-only unsent words" } });
    const refreshed = refreshedProps();
    rerender(<EmailArtifactsDetail {...refreshed} edit={editableEditAt("rev_refresh")} />);
    expect(editorOf(container).value).toBe("Text-only unsent words");
    expect(subjectOf(container)).toBeNull();
    expect(indicatorOf(container).getAttribute("data-state")).toBe("not-saved");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains a body typed before the pause as unsaved, then saves a new edit against the refreshed sender and base", async () => {
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(editorOf(container), { target: { value: "My unsent body." } });
    await settle(300);
    const sender = '<!-- email-sender {"name":"New Sender","address":"new@example.test"} -->';
    rerender(<EmailArtifactsDetail {...refreshedProps("rev_refresh", `${sender}\n\nStored elsewhere.`)} />);

    expect(editorOf(container).value).toBe("My unsent body.");
    expect(indicatorOf(container).getAttribute("data-state")).toBe("not-saved");
    expect(container.querySelector('[data-region="sender-name"]')?.textContent).toBe("New Sender");
    expect(subjectOf(container).value).toBe("Refreshed subject");
    await settle();
    // Retaining the draft must not silently write old words over the new base.
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(editorOf(container), { target: { value: "My unsent body, continued." } });
    await settle();
    expect(sentBodies(fetchMock)).toEqual([expect.objectContaining({
      baseRevisionId: "rev_refresh", text: `${sender}\n\nMy unsent body, continued.`,
    })]);
    expect(indicatorOf(container).getAttribute("data-state")).toBe("saved");
  });

  it("retains both pending fields, and storing only one cannot mark the other Saved", async () => {
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(subjectOf(container), { target: { value: "My unsent subject" } });
    fireEvent.change(editorOf(container), { target: { value: "My unsent body" } });
    rerender(<EmailArtifactsDetail {...refreshedProps()} />);
    expect(subjectOf(container).value).toBe("My unsent subject");
    expect(editorOf(container).value).toBe("My unsent body");
    expect(indicatorOf(container).getAttribute("data-state")).toBe("not-saved");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(editorOf(container), { target: { value: "Body continued" } });
    await settle();
    expect(sentBodies(fetchMock)).toEqual([expect.objectContaining({ baseRevisionId: "rev_refresh", text: "Body continued" })]);
    expect(indicatorOf(container).getAttribute("data-state")).toBe("not-saved");
    fireEvent.change(subjectOf(container), { target: { value: "Subject continued" } });
    await settle();
    expect(sentBodies(fetchMock)[1]).toMatchObject({ baseRevisionId: "rev_9", field: "title", title: "Subject continued" });
    expect(indicatorOf(container).getAttribute("data-state")).toBe("saved");
  });

  it.each(["text", "title"] as const)("retains a previously refused %s edit across a refresh", async (field) => {
    fetchMock.mockImplementationOnce(async () => answer({ outcome: "refused", reason: "over-cap" }));
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    const control = field === "text" ? editorOf(container) : subjectOf(container);
    fireEvent.change(control, { target: { value: "Still not stored" } });
    await settle();
    expect(indicatorOf(container).getAttribute("data-state")).toBe("not-saved");
    rerender(<EmailArtifactsDetail {...refreshedProps()} />);
    expect((field === "text" ? editorOf(container) : subjectOf(container)).value).toBe("Still not stored");
    expect(indicatorOf(container).getAttribute("data-state")).toBe("not-saved");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads both stored fields when no local edit remains", async () => {
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(editorOf(container), { target: { value: "Already stored" } });
    await settle();
    rerender(<EmailArtifactsDetail {...refreshedProps()} />);
    expect(editorOf(container).value).toBe("Stored in another tab.");
    expect(subjectOf(container).value).toBe("Refreshed subject");
    expect(indicatorOf(container).getAttribute("data-state")).toBe("saved");
  });

  it.each(["saved", "stale", "refused"] as const)("ignores a late %s answer from before the refresh without discarding the in-flight draft", async (outcome) => {
    let release: ((body: unknown) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      release = (body) => resolve(answer(body));
    }));
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(editorOf(container), { target: { value: "In-flight words" } });
    await settle();
    rerender(<EmailArtifactsDetail {...refreshedProps()} />);
    expect(editorOf(container).value).toBe("In-flight words");
    expect(indicatorOf(container).getAttribute("data-state")).toBe("not-saved");
    await act(async () => {
      release?.(outcome === "saved" ? { outcome, revisionId: "rev_old_answer", revision: 8 }
        : outcome === "stale" ? { outcome, latestRevisionId: "rev_old_stale", latestRevision: 8, text: "Old response text", truncated: false, title: "Old response subject" }
          : { outcome, reason: "over-cap" });
      await Promise.resolve();
    });
    await settle();
    expect(editorOf(container).value).toBe("In-flight words");
    expect(subjectOf(container).value).toBe("Refreshed subject");
    expect(indicatorOf(container).getAttribute("data-state")).toBe("not-saved");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(editorOf(container), { target: { value: "New explicit edit" } });
    await settle();
    expect(sentBodies(fetchMock)[1]).toMatchObject({ baseRevisionId: "rev_refresh", text: "New explicit edit" });
  });

  it("serializes a new edit behind the old response but never reuses that response's base", async () => {
    let release: (() => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      release = () => resolve(answer({ outcome: "saved", revisionId: "rev_old_answer", revision: 8 }));
    }));
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(subjectOf(container), { target: { value: "Old flight subject" } });
    await settle();
    fireEvent.change(editorOf(container), { target: { value: "Pending body" } });
    rerender(<EmailArtifactsDetail {...refreshedProps()} />);
    fireEvent.change(editorOf(container), { target: { value: "Body after refresh" } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { release?.(); await Promise.resolve(); });
    await settle(0);
    expect(sentBodies(fetchMock)[1]).toMatchObject({ baseRevisionId: "rev_refresh", text: "Body after refresh" });
    expect(subjectOf(container).value).toBe("Old flight subject");
    expect(indicatorOf(container).getAttribute("data-state")).toBe("not-saved");
  });
});

describe("editing authority changes while a save is outstanding", () => {
  it("uses the channel's admitted fields without spreading malformed field metadata", () => {
    if (editableEdit.kind !== "editable") throw new Error("Expected text grant");
    const malformed = { ...editableEdit, fields: { title: true } as unknown as readonly ["title"] };
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: malformed })} />);
    expect(editorOf(container)).not.toBeNull();
    expect(subjectOf(container)).toBeNull();
  });

  it("never applies an old artifact's answer to the new artifact or releases its outstanding save", async () => {
    let releaseOld: (() => void) | undefined;
    let releaseNew: (() => void) | undefined;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        releaseOld = () => resolve(answer({ outcome: "stale", latestRevisionId: "rev_old", latestRevision: 8, text: "Old artifact words", truncated: false }));
      }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        releaseNew = () => resolve(answer({ outcome: "saved", revisionId: "rev_new_saved", revision: 10 }));
      }));
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    fireEvent.change(editorOf(container), { target: { value: "First artifact edit" } });
    await settle();
    rerender(<EmailArtifactsDetail {...bodyProps({ artifactId: "art_2", edit: editableEditAt("rev_art_2", "art_2"), markdown: "Second artifact stored" })} />);
    fireEvent.change(editorOf(container), { target: { value: "Second artifact edit" } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { releaseOld?.(); await Promise.resolve(); });
    expect(editorOf(container).value).toBe("Second artifact edit");
    expect(indicatorOf(container).getAttribute("data-state")).toBe("saving");
    fireEvent.change(editorOf(container), { target: { value: "Second artifact continued" } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { releaseNew?.(); await Promise.resolve(); });
    await settle(0);
    expect(sentBodies(fetchMock)[2]).toMatchObject({ baseRevisionId: "rev_new_saved", text: "Second artifact continued" });
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(call[0]).toBe("/api/artifacts/art_2/edit");
      expect(JSON.parse(String((call[1] as RequestInit).body)).text).not.toContain("First artifact");
    }
  });

  it("drops the old queue when authority disappears, and never resurrects it under a later grant", async () => {
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    fireEvent.change(editorOf(container), { target: { value: "Before permission loss" } });
    rerender(<EmailArtifactsDetail {...bodyProps({ edit: readOnlyEdit, markdown: "Read-only stored" })} />);
    expect(editorOf(container)).toBeNull();
    rerender(<EmailArtifactsDetail {...bodyProps({ edit: editableEditAt("rev_authorized"), markdown: "New authorized stored" })} />);
    expect(editorOf(container).value).toBe("New authorized stored");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(editorOf(container), { target: { value: "New authorized edit" } });
    await settle();
    expect(sentBodies(fetchMock)[0]).toMatchObject({ baseRevisionId: "rev_authorized", text: "New authorized edit" });
  });

  it("does not carry pending fields into a changed save address at the same revision", async () => {
    if (editableTitleEdit.kind !== "editable") throw new Error("Expected title grant");
    const { container, rerender } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableTitleEdit })} />);
    fireEvent.change(editorOf(container), { target: { value: "Old address body" } });
    fireEvent.change(subjectOf(container), { target: { value: "Old address subject" } });
    rerender(<EmailArtifactsDetail {...bodyProps({ edit: { ...editableTitleEdit, saveUrl: "/api/new-edit-grant" }, markdown: "New grant stored", title: "New grant subject" })} />);
    expect(editorOf(container).value).toBe("New grant stored");
    expect(subjectOf(container).value).toBe("New grant subject");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the editor's base revision, over more than one change set", () => {
  it("saves the second change against the revision the first change made", async () => {
    let revision = 9;
    fetchMock.mockImplementation(async () => {
      revision += 1;
      return answer({ outcome: "saved", revisionId: `rev_${revision}`, revision });
    });
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);

    fireEvent.change(editorOf(container), { target: { value: "First." } });
    await settle();
    fireEvent.change(editorOf(container), { target: { value: "Second." } });
    await settle();

    const bodies = sentBodies(fetchMock);
    expect(bodies).toHaveLength(2);
    // THE FIRST change set names the revision the editor opened at.
    expect(bodies[0]).toMatchObject({ baseRevisionId: REVISION_ID, text: "First." });
    // THE SECOND names the revision the FIRST one made — not the opened one,
    // which the store has already moved past. Sending the opened revision again
    // would have the reader's own first save refuse their second.
    expect(bodies[1]).toMatchObject({ baseRevisionId: "rev_10", text: "Second." });
    expect(indicatorOf(container).textContent).toContain("Saved");
  });

  it("saves the next change against the revision a stale answer reloaded onto", async () => {
    fetchMock
      .mockImplementationOnce(async () =>
        answer({
          outcome: "stale",
          latestRevisionId: "rev_newer",
          latestRevision: 7,
          text: "The newer revision's words.",
          truncated: false,
        }),
      )
      .mockImplementation(async () =>
        answer({ outcome: "saved", revisionId: "rev_8", revision: 8 }),
      );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);

    fireEvent.change(editorOf(container), { target: { value: "Mine." } });
    await settle();
    expect(editorOf(container).value).toBe("The newer revision's words.");

    fireEvent.change(editorOf(container), { target: { value: "The newer revision's words, edited." } });
    await settle();

    const bodies = sentBodies(fetchMock);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({ baseRevisionId: "rev_newer" });
  });
});

describe("a change set made while another is in flight", () => {
  it("waits for the answer rather than racing it, and is sent exactly once", async () => {
    let release: (() => void) | null = null;
    fetchMock.mockImplementationOnce(
      async () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(answer({ outcome: "saved", revisionId: "rev_10", revision: 10 }));
        }),
    );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);

    fireEvent.change(editorOf(container), { target: { value: "First." } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The second change set is made while the first is still unanswered.
    fireEvent.change(editorOf(container), { target: { value: "Second." } });
    await settle();
    // STILL ONE: two change sets are never in flight against the same editor.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    await settle(0);

    const bodies = sentBodies(fetchMock);
    // Exactly one more, and the second is not sent twice by the timer that was
    // already armed for it.
    expect(bodies).toHaveLength(2);
    expect(bodies[1].text).toBe("Second.");
  });

  it("never reads as stored while the text on screen is not the text answered for", async () => {
    let release: (() => void) | null = null;
    fetchMock.mockImplementationOnce(
      async () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(answer({ outcome: "saved", revisionId: "rev_10", revision: 10 }));
        }),
    );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);

    fireEvent.change(editorOf(container), { target: { value: "First." } });
    await settle();
    fireEvent.change(editorOf(container), { target: { value: "Second." } });

    await act(async () => {
      release?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The first change set is stored; the SECOND is on screen and is not. An
    // indicator reading "Saved" here would say the words in front of the reader
    // are the words in the store.
    expect(editorOf(container).value).toBe("Second.");
    expect(indicatorOf(container).textContent).toContain("Saving");
  });
});

describe("a stale answer, with work queued behind the refused change set", () => {
  it("drops what was queued rather than writing it over the newer revision", async () => {
    let release: (() => void) | null = null;
    fetchMock.mockImplementationOnce(
      async () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              answer({
                outcome: "stale",
                latestRevisionId: "rev_newer",
                latestRevision: 7,
                text: "The newer revision's words.",
                truncated: false,
              }),
            );
        }),
    );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);

    fireEvent.change(editorOf(container), { target: { value: "First." } });
    await settle();
    fireEvent.change(editorOf(container), { target: { value: "Second." } });
    await settle();

    await act(async () => {
      release?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    await settle();

    // ONE call: the queued change set went with the reload it was made against,
    // and no armed timer resurrected it afterwards.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(editorOf(container).value).toBe("The newer revision's words.");
    // AND THE READER IS TOLD their change was not stored — the newer revision
    // on screen is not their work.
    expect(indicatorOf(container).textContent).not.toContain("Saved");
    expect(indicatorOf(container).getAttribute("data-state")).toBe("reloaded");
  });

  it("closes the editor when the revision it reloaded onto came back cut", async () => {
    fetchMock.mockImplementation(async () =>
      answer({
        outcome: "stale",
        latestRevisionId: "rev_newer",
        latestRevision: 7,
        text: "The beginning of a much longer message.",
        truncated: true,
      }),
    );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />);
    fireEvent.change(editorOf(container), { target: { value: "Mine." } });
    await settle();
    // A PREFIX IS NOT THE DOCUMENT, and a change set is the whole document: an
    // editor left open over a cut revision would save the beginning over it.
    expect(container.querySelector('[data-region="body-editor"]')).toBeNull();
  });
});

describe("leaving the view", () => {
  it("sends the change set the pause never bounded, marked to outlive the document", async () => {
    const { container, unmount } = render(
      <EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />,
    );
    fireEvent.change(editorOf(container), { target: { value: "Written on the way out." } });
    // The idle pause has NOT elapsed.
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit & { keepalive?: boolean };
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body)).text).toBe("Written on the way out.");
  });

  it("sends a change set whose pause elapsed while an earlier save was in flight", async () => {
    let release: (() => void) | null = null;
    fetchMock.mockImplementationOnce(
      async () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(answer({ outcome: "saved", revisionId: "rev_10", revision: 10 }));
        }),
    );
    const { container, unmount } = render(
      <EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />,
    );
    fireEvent.change(editorOf(container), { target: { value: "First." } });
    await settle();
    fireEvent.change(editorOf(container), { target: { value: "Second." } });
    await settle();
    // The second change set is bounded but waiting behind the first, so no
    // timer is left to notice the reader leaving.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      unmount();
      release?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    const bodies = sentBodies(fetchMock);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].text).toBe("Second.");
  });
});

describe("the edit session is one artifact opened at one revision", () => {
  it("carries no unsent words from one artifact into the next", async () => {
    const { container, rerender } = render(
      <EmailArtifactsDetail {...bodyProps({ edit: editableEdit })} />,
    );
    fireEvent.change(editorOf(container), { target: { value: "Words about the first." } });

    await act(async () => {
      rerender(
        <EmailArtifactsDetail
          {...bodyProps({
            artifactId: "art_2",
            markdown: "The second artifact's own words.",
            edit: editableEditAt(REVISION_ID, "art_2"),
          })}
        />,
      );
      await Promise.resolve();
    });

    // The next artifact opens on ITS OWN text — never the previous reader's
    // draft drawn under a different artifact's metadata.
    expect(editorOf(container).value).toBe("The second artifact's own words.");
    await settle();
    // And the abandoned draft is never posted under the new artifact's grant.
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(String((call[1] as RequestInit).body)).text).not.toContain(
        "Words about the first",
      );
    }
  });
});
