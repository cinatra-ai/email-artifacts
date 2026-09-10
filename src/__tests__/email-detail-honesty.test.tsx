import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import EmailArtifactsDetail from "../renderers/detail";
import {
  EMAIL_DETAIL_NOTICE_SENTENCES,
  emailDetailFloorMessage,
} from "../renderers/email-detail-contract";
import { resolveEmailDetailView } from "../renderers/email-detail-view";
import {
  bodyProps,
  objectProps,
  editableEdit,
  BODY_MARKDOWN,
  SENT_EMAIL_DATA,
} from "./email-detail-fixtures";

// WHAT THE PANE SAYS ABOUT WHAT IT IS DRAWING. The content channel "degrades
// honestly" and hands an object-backed display a projection that is discriminated
// on `source` — "the live object data, or a minted snapshot revision — AND SAYS
// WHICH OF THE TWO IT IS SHOWING". A pane that drew a cut message as the message,
// or a moving row as the revision a decision binds, would be the half of that
// contract that lies.

afterEach(() => cleanup());

describe("the pane says which reading it is showing", () => {
  it("names the live arm on a record read live", () => {
    const { container } = render(
      <EmailArtifactsDetail
        {...objectProps("@cinatra-ai/email:sent-email", SENT_EMAIL_DATA, { source: "live" })}
      />,
    );
    const source = container.querySelector('[data-region="source"]');
    expect(source?.getAttribute("data-source")).toBe("live");
    expect(source?.textContent).toBe(EMAIL_DETAIL_NOTICE_SENTENCES.live);
  });

  it("names the snapshot arm on the pinned revision a decision binds", () => {
    const { container } = render(
      <EmailArtifactsDetail
        {...objectProps("@cinatra-ai/email:sent-email", SENT_EMAIL_DATA, { source: "snapshot" })}
      />,
    );
    const source = container.querySelector('[data-region="source"]');
    expect(source?.getAttribute("data-source")).toBe("snapshot");
    expect(source?.textContent).toBe(EMAIL_DETAIL_NOTICE_SENTENCES.snapshot);
  });

  it("draws no such notice on the text arm, which is a pinned revision and neither of the two", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps()} />);
    expect(container.querySelector('[data-region="source"]')).toBeNull();
  });

  it("refuses a projection whose arm and revision do not go together", () => {
    const props = objectProps("@cinatra-ai/email:sent-email", SENT_EMAIL_DATA, { source: "live" });
    const bent = {
      ...props,
      content: { ...props.content, representationRevisionId: "rev_pinned" },
    } as typeof props;
    expect(resolveEmailDetailView(bent)).toEqual({
      kind: "floor",
      reason: "invalid-content-projection",
    });
  });
});

describe("a message the channel had to cut", () => {
  it("says the pane is drawing a beginning, rather than passing it off as the message", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps({ truncated: true })} />);
    expect(container.querySelector('[data-region="truncation-notice"]')?.textContent).toBe(
      EMAIL_DETAIL_NOTICE_SENTENCES.truncated,
    );
  });

  it("draws no such notice where the whole message was carried", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps()} />);
    expect(container.querySelector('[data-region="truncation-notice"]')).toBeNull();
  });
});

describe("the editor opens on the stored text, not on what was left to draw", () => {
  it("opens on a document whose sanitized rendering is empty", () => {
    const { container } = render(
      <EmailArtifactsDetail {...bodyProps({ markdown: "   \n\n   ", edit: editableEdit })} />,
    );
    const editor = container.querySelector('[data-region="body-editor"]') as HTMLTextAreaElement;
    // THE WHOLE DOCUMENT IS WHAT A CHANGE SET CARRIES. An editor that opened
    // empty here would send that emptiness back over the stored text the moment
    // the reader touched it.
    expect(editor.value).toBe("   \n\n   ");
  });
});

describe("the resolver is total over a type it did not expect", () => {
  it("draws no mail for an object type that is only a name every object inherits", () => {
    const props = bodyProps();
    const bent = {
      ...props,
      artifact: { ...props.artifact, objectType: "constructor" },
    } as typeof props;
    expect(resolveEmailDetailView(bent)).toEqual({ kind: "floor", reason: "not-mail" });
  });

  it("does not throw on an object type that is not a string at all", () => {
    const props = bodyProps();
    const bent = {
      ...props,
      artifact: {
        ...props.artifact,
        objectType: {
          toString() {
            throw new Error("a display must never take the surface down with it");
          },
        },
      },
    } as unknown as typeof props;
    expect(() => resolveEmailDetailView(bent)).not.toThrow();
    expect(resolveEmailDetailView(bent)).toEqual({ kind: "floor", reason: "not-mail" });
  });
});

describe("the text arm draws the pane's own regions", () => {
  it("draws the subject, the rule and the body from a draft body's text projection", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps()} />);
    // The regions the DRAWN surface pins, proven on the arm a draft body
    // actually arrives on — not only on the object arm the records use.
    for (const name of ["pane", "sender-block", "date", "subject", "rule", "body"]) {
      expect(container.querySelector(`[data-region="${name}"]`)).toBeTruthy();
    }
    expect(container.querySelector('[data-region="body"]')?.textContent).toContain(
      BODY_MARKDOWN.slice(0, 20),
    );
  });

  it("answers a snapshot with no message text with the floor, never a blank pane", () => {
    const props = bodyProps();
    const bent = {
      ...props,
      content: { ...props.content, kind: "none", reason: "absent" },
    } as unknown as typeof props;
    const { container } = render(<EmailArtifactsDetail {...bent} />);
    expect(container.querySelector('[data-region="floor"]')?.textContent).toBe(
      emailDetailFloorMessage("content-absent"),
    );
  });
});
