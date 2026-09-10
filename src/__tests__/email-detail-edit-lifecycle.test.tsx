import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { ARTIFACT_EDIT_IDLE_PAUSE_MS } from "@cinatra-ai/sdk-extensions/artifact-edit-channel";

import EmailArtifactsDetail from "../renderers/detail";
import { bodyProps, editableEdit, editableEditAt, REVISION_ID } from "./email-detail-fixtures";

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
