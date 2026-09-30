import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { ARTIFACT_EDIT_IDLE_PAUSE_MS } from "@cinatra-ai/sdk-extensions/artifact-edit-channel";

import EmailArtifactsDetail from "../renderers/detail";
import { EMAIL_DETAIL_GAP_SENTENCES } from "../renderers/email-detail-contract";
import { bodyProps, editableEdit, readOnlyEdit, BODY_MARKDOWN } from "./email-detail-fixtures";

// cinatra#3816: a draft's content names its sending account in a head line
// before the message, and the pane draws the sender block from it — on a
// review target and on the artifact's own page — while an edit of the body in
// place keeps that head exactly as it was filed.

const HEAD = '<!-- email-sender {"name":"Anna Keller","address":"anna.keller@acme.example"} -->';
const OTHER_HEAD = '<!-- email-sender {"name":"Jonas Weber","address":"jonas.weber@acme.example"} -->';
const FILED = `${HEAD}\n\n${BODY_MARKDOWN}`;

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

const within = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-region="${name}"]`);

describe("the sender a draft's content names", () => {
  it("S1 draws the sender block from the content on a review target", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ markdown: FILED, edit: readOnlyEdit })} />);
    expect(within(container, "avatar")?.textContent).toBe("AK");
    expect(within(container, "sender-name")?.textContent).toBe("Anna Keller");
    expect(within(container, "sender-address")?.textContent).toBe("anna.keller@acme.example");
    expect(within(container, "sender-gap")).toBeNull();
  });

  it("S2 draws the same sender block on the artifact's own page, and the editor holds the message alone", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ markdown: FILED, edit: editableEdit })} />);
    expect(within(container, "sender-name")?.textContent).toBe("Anna Keller");
    expect(within(container, "sender-address")?.textContent).toBe("anna.keller@acme.example");
    expect((within(container, "body-editor") as HTMLTextAreaElement).value).toBe(BODY_MARKDOWN);
  });

  it("S3 never draws the head as part of the message", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ markdown: FILED, edit: readOnlyEdit })} />);
    const body = within(container, "body") as HTMLElement;
    expect(body.textContent).toContain("following up on the pilot");
    expect(body.innerHTML).not.toContain("email-sender");
  });

  it("S4 keeps the sender exactly as it was filed when the body is edited in place", async () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ markdown: FILED, edit: editableEdit })} />);
    fireEvent.change(within(container, "body-editor") as HTMLTextAreaElement, {
      target: { value: "A shorter note." },
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).text).toBe(`${HEAD}\n\nA shorter note.`);
  });

  it("S5 draws the state without a sender where the content names none", () => {
    for (const markdown of [
      BODY_MARKDOWN,
      `<!-- email-sender {"name":"Anna Keller"} -->\n\n${BODY_MARKDOWN}`,
      `<!-- email-sender {"address":"anna.keller@acme.example"} -->\n\n${BODY_MARKDOWN}`,
      `<!-- email-sender {not json} -->\n\n${BODY_MARKDOWN}`,
    ]) {
      const { container, unmount } = render(<EmailArtifactsDetail {...bodyProps({ markdown, edit: readOnlyEdit })} />);
      expect(within(container, "sender-gap")?.textContent).toBe(EMAIL_DETAIL_GAP_SENTENCES.sender);
      expect(within(container, "sender-name")).toBeNull();
      unmount();
    }
  });

  it("S6 opens the editor on the whole stored text where the head names no sender", () => {
    const stored = `<!-- email-sender {not json} -->\n\n${BODY_MARKDOWN}`;
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ markdown: stored, edit: editableEdit })} />);
    expect((within(container, "body-editor") as HTMLTextAreaElement).value).toBe(stored);
  });

  it("S7 reloads onto a newer revision with that revision's sender, and saves under it next", async () => {
    fetchMock.mockImplementationOnce(async () =>
      answer({
        outcome: "stale",
        latestRevisionId: "rev_newer",
        latestRevision: 7,
        text: `${OTHER_HEAD}\n\nThe newer revision's words.`,
        truncated: false,
      }),
    );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ markdown: FILED, edit: editableEdit })} />);
    fireEvent.change(within(container, "body-editor") as HTMLTextAreaElement, {
      target: { value: "A shorter note." },
    });
    await settle();
    const editor = within(container, "body-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe("The newer revision's words.");
    expect(within(container, "sender-name")?.textContent).toBe("Jonas Weber");
    fireEvent.change(editor, { target: { value: "The newer revision's words, and one more." } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).text).toBe(
      `${OTHER_HEAD}\n\nThe newer revision's words, and one more.`,
    );
  });

  it("S8 takes a head line with no line break after it as no head, so an edit cannot fuse it with the message", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ markdown: HEAD, edit: editableEdit })} />);
    expect(within(container, "sender-gap")?.textContent).toBe(EMAIL_DETAIL_GAP_SENTENCES.sender);
    expect((within(container, "body-editor") as HTMLTextAreaElement).value).toBe(HEAD);
  });

  it("S9 names no sender where a value carries a line break, even at its edges", () => {
    for (const markdown of [
      `<!-- email-sender {"name":"\\nAnna Keller","address":"anna.keller@acme.example"} -->\n\n${BODY_MARKDOWN}`,
      `<!-- email-sender {"name":"Anna Keller","address":"anna.keller@acme.example\\r"} -->\n\n${BODY_MARKDOWN}`,
    ]) {
      const { container, unmount } = render(<EmailArtifactsDetail {...bodyProps({ markdown, edit: readOnlyEdit })} />);
      expect(within(container, "sender-gap")?.textContent).toBe(EMAIL_DETAIL_GAP_SENTENCES.sender);
      expect(within(container, "sender-name")).toBeNull();
      unmount();
    }
  });

  it("S10 keeps the opened sender beside the opened message when a cut reload closes the editor", async () => {
    fetchMock.mockImplementationOnce(async () =>
      answer({
        outcome: "stale",
        latestRevisionId: "rev_newer",
        latestRevision: 7,
        text: `${OTHER_HEAD}\n\nThe newer revision's`,
        truncated: true,
      }),
    );
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ markdown: FILED, edit: editableEdit })} />);
    fireEvent.change(within(container, "body-editor") as HTMLTextAreaElement, {
      target: { value: "A shorter note." },
    });
    await settle();
    expect(within(container, "body-editor")).toBeNull();
    expect(within(container, "body")?.textContent).toContain("following up on the pilot");
    expect(within(container, "sender-name")?.textContent).toBe("Anna Keller");
  });
});
