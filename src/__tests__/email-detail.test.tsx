import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import EmailArtifactsDetail from "../renderers/detail";
import { EMAIL_DETAIL_GAP_SENTENCES } from "../renderers/email-detail-contract";
import { bodyProps, objectProps, BODY_MARKDOWN } from "./email-detail-fixtures";

// THE MAIL DETAIL PANE, region by region, drawn from a body artifact's own
// content-channel projection (drawing XI.1). One test per drawn region.

afterEach(() => cleanup());

const region = (name: string) => document.querySelector(`[data-region="${name}"]`);

describe("the mail detail pane — the drawn regions", () => {
  it("draws the sender block, and the date at the end of that same line", () => {
    render(<EmailArtifactsDetail {...bodyProps()} />);
    const block = region("sender-block");
    expect(block).toBeTruthy();
    const date = region("date");
    expect(date).toBeTruthy();
    expect(block?.contains(date as Node)).toBe(true);
    expect(date?.textContent).toContain("14");
    expect(date?.textContent).toContain("Aug");
    expect(date?.textContent).toContain("2026");
  });

  it("draws the initials avatar and the name, with the address right beneath the name and no prefix", () => {
    render(
      <EmailArtifactsDetail
        {...objectProps("@cinatra-ai/email:body", {
          subject: "Re-connecting on Q3 priorities",
          bodyMarkdown: BODY_MARKDOWN,
          fromName: "Anna Keller",
          fromEmail: "anna.keller@acme.example",
        })}
      />,
    );
    const avatar = region("avatar");
    const name = region("sender-name");
    const address = region("sender-address");
    expect(avatar?.textContent).toBe("AK");
    expect(name?.textContent).toBe("Anna Keller");
    // NO PREFIX: the address is the address and nothing else — no "To:", no
    // "From:", no label of any kind before it.
    expect(address?.textContent).toBe("anna.keller@acme.example");
    // RIGHT BENEATH the name: the address follows the name in the document.
    expect(
      (name as Node).compareDocumentPosition(address as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws a named gap in the sending account's place when the projection carries none", () => {
    render(<EmailArtifactsDetail {...bodyProps()} />);
    expect(region("sender-gap")?.textContent).toBe(EMAIL_DETAIL_GAP_SENTENCES.sender);
    expect(region("sender-name")).toBeNull();
  });

  it("draws the subject under the sender block", () => {
    render(<EmailArtifactsDetail {...bodyProps()} />);
    const subject = region("subject");
    expect(subject?.textContent).toBe("Re-connecting on Q3 priorities");
    expect(
      (region("sender-block") as Node).compareDocumentPosition(subject as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws the body under a rule", () => {
    render(<EmailArtifactsDetail {...bodyProps()} />);
    const rule = region("rule");
    const body = region("body");
    expect(rule).toBeTruthy();
    expect(body?.textContent).toContain("following up on the pilot");
    expect(
      (rule as Node).compareDocumentPosition(body as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("takes the sanitizer from the SDK leaf: raw markup and an unsafe href never reach the pane", () => {
    render(
      <EmailArtifactsDetail
        {...bodyProps({
          markdown: "Hello <script>alert(1)</script>\n\n[press](javascript:alert(1))",
        })}
      />,
    );
    const body = region("body") as HTMLElement;
    expect(body.querySelector("script")).toBeNull();
    expect(body.innerHTML).not.toContain("<script");
    expect(body.querySelector('a[href^="javascript:"]')).toBeNull();
    // The words survive; only the markup does not.
    expect(body.textContent).toContain("Hello");
  });

  it("draws no picture: the avatar is a plain disc of initials, never an image", () => {
    const { container } = render(
      <EmailArtifactsDetail
        {...objectProps("@cinatra-ai/email:body", {
          subject: "Re-connecting on Q3 priorities",
          bodyMarkdown: BODY_MARKDOWN,
          fromName: "Anna Keller",
          fromEmail: "anna.keller@acme.example",
        })}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(region("avatar")?.querySelector("img")).toBeNull();
    expect(region("avatar")?.textContent).toBe("AK");
  });

  it("is one view: no tab strip and no second reading to switch to", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps()} />);
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(screen.queryByText(/^code$/i)).toBeNull();
    expect(screen.queryByText(/^preview$/i)).toBeNull();
  });

  it("carries no reply field and no compose affordance of any kind — absent, not disabled", () => {
    const { container } = render(<EmailArtifactsDetail {...bodyProps()} />);
    expect(container.querySelector('[data-region="reply"]')).toBeNull();
    expect(screen.queryByText(/repl/i)).toBeNull();
    expect(screen.queryByText(/compose/i)).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    // Read-only surface: no editable region at all, disabled or otherwise.
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
  });

  it("carries no decision affordance: Comment, Regenerate and Continue belong to the surface", () => {
    render(<EmailArtifactsDetail {...bodyProps()} />);
    expect(screen.queryByText(/comment/i)).toBeNull();
    expect(screen.queryByText(/regenerate/i)).toBeNull();
    expect(screen.queryByText(/continue/i)).toBeNull();
  });
});
