import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import EmailArtifactsDetail from "../renderers/detail";
import { emailDetailFloorMessage } from "../renderers/email-detail-contract";
import {
  objectProps,
  editableEdit,
  BODY_MARKDOWN,
  SENT_EMAIL_DATA,
  RECEIVED_REPLY_DATA,
} from "./email-detail-fixtures";

// THE TWO EMAIL RECORD TYPES, under the object-backed contract (drawing XI.1):
// "their display reads the object's projection live and carries the same chrome
// as the body display above, read only throughout".

afterEach(() => cleanup());

const regionsOf = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("[data-region]"))
    .map((node) => node.getAttribute("data-region"))
    .filter((name): name is string => name !== null)
    .sort();

describe("the two email record types", () => {
  it("draws a sent email through the same pane", () => {
    const { container } = render(
      <EmailArtifactsDetail {...objectProps("@cinatra-ai/email:sent-email", SENT_EMAIL_DATA)} />,
    );
    expect(container.querySelector('[data-region="sender-name"]')?.textContent).toBe("Anna Keller");
    expect(container.querySelector('[data-region="sender-address"]')?.textContent).toBe(
      "anna.keller@acme.example",
    );
    expect(container.querySelector('[data-region="subject"]')?.textContent).toBe(
      "Re-connecting on Q3 priorities",
    );
    expect(container.querySelector('[data-region="body"]')?.textContent).toContain(
      "following up on the pilot",
    );
  });

  it("draws a received reply through the same pane", () => {
    const { container } = render(
      <EmailArtifactsDetail
        {...objectProps("@cinatra-ai/email:received-reply", RECEIVED_REPLY_DATA)}
      />,
    );
    expect(container.querySelector('[data-region="sender-name"]')?.textContent).toBe("Anna Keller");
    expect(container.querySelector('[data-region="subject"]')?.textContent).toBe(
      "Re-connecting on Q3 priorities",
    );
    expect(container.querySelector('[data-region="body"]')?.textContent).toContain(
      "following up on the pilot",
    );
  });

  it("gives both record types the same chrome as the body display", () => {
    const { container: sent } = render(
      <EmailArtifactsDetail {...objectProps("@cinatra-ai/email:sent-email", SENT_EMAIL_DATA)} />,
    );
    const sentRegions = regionsOf(sent);
    cleanup();
    const { container: reply } = render(
      <EmailArtifactsDetail
        {...objectProps("@cinatra-ai/email:received-reply", RECEIVED_REPLY_DATA)}
      />,
    );
    const replyRegions = regionsOf(reply);
    cleanup();
    const { container: body } = render(
      <EmailArtifactsDetail
        {...objectProps("@cinatra-ai/email:body", {
          subject: "Re-connecting on Q3 priorities",
          bodyMarkdown: BODY_MARKDOWN,
          fromName: "Anna Keller",
          fromEmail: "anna.keller@acme.example",
        })}
      />,
    );
    expect(sentRegions).toEqual(replyRegions);
    expect(sentRegions).toEqual(regionsOf(body));
  });

  it("is read only throughout — a record takes no edit even where the host granted one", () => {
    for (const [type, data] of [
      ["@cinatra-ai/email:sent-email", SENT_EMAIL_DATA],
      ["@cinatra-ai/email:received-reply", RECEIVED_REPLY_DATA],
    ] as const) {
      const { container } = render(
        <EmailArtifactsDetail {...objectProps(type, data, { edit: editableEdit })} />,
      );
      expect(container.querySelector("textarea")).toBeNull();
      expect(container.querySelector('[contenteditable="true"]')).toBeNull();
      expect(container.querySelector('[data-region="saving-indicator"]')).toBeNull();
      cleanup();
    }
  });

  it("reads a snapshot arm exactly as a live one — the same chrome, read only", () => {
    const { container } = render(
      <EmailArtifactsDetail
        {...objectProps("@cinatra-ai/email:sent-email", SENT_EMAIL_DATA, { source: "snapshot" })}
      />,
    );
    expect(container.querySelector('[data-region="subject"]')?.textContent).toBe(
      "Re-connecting on Q3 priorities",
    );
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("says so, rather than drawing a blank, for the delivery target that projects nothing", () => {
    const { container } = render(
      <EmailArtifactsDetail {...objectProps("@cinatra-ai/email:recipient", { runId: "r1", email: "x@y.test" })} />,
    );
    expect(container.querySelector('[data-region="floor"]')?.textContent).toBe(
      emailDetailFloorMessage("delivery-target"),
    );
    expect(container.querySelector('[data-region="sender-block"]')).toBeNull();
  });
});
