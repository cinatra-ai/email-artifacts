// THE VIEW CONTRACT for the email body display — what the mail detail pane can
// be showing, and what it says when it is showing nothing.
//
// SANITIZER-FREE, DELIBERATELY. The view leaf beside this module reaches the
// SDK's shared markdown sanitizer; this module reaches nothing at all, so the
// contract can be read (and asserted) without pulling a parser in behind it.
//
// The drawn surface is the ratified drawing's mail detail pane: the sender
// block — the initials avatar, the name, and the address on the line right
// beneath that name — the date at the end of that same line, the subject under
// them, and the body under a rule. One view, and no second reading to switch to.

import type { ArtifactRendererProps } from "@cinatra-ai/sdk-extensions";

/** The props-contract version this display declares, and the only one it
 *  accepts a snapshot at. The manifest entry declares the same number, so the
 *  host resolves the display and builds the snapshot at one version. */
export const EMAIL_DISPLAY_PROPS_API_VERSION = 1;

/** The pack's own object types, spelled out so the display and its manifest
 *  cannot drift about which rows it is drawn for. */
export const EMAIL_BODY_TYPE = "@cinatra-ai/email:body";
export const EMAIL_SENT_EMAIL_TYPE = "@cinatra-ai/email:sent-email";
export const EMAIL_RECEIVED_REPLY_TYPE = "@cinatra-ai/email:received-reply";
export const EMAIL_RECIPIENT_TYPE = "@cinatra-ai/email:recipient";

/** The three kinds of mail this pane draws. A draft body takes an edit; the two
 *  records are read only throughout, because a record is not drafted. */
export type EmailRecordKind = "body" | "sent-email" | "received-reply";

export type EmailDetailFloorReason =
  | "malformed-props"
  | "props-version"
  | "channel-version"
  | "content-unavailable"
  | "content-absent"
  | "content-over-cap"
  | "content-unsupported-form"
  | "invalid-content-projection"
  | "delivery-target"
  | "not-mail"
  | "render-failed";

const FLOOR_MESSAGES: Record<EmailDetailFloorReason, string> = {
  "malformed-props": "This message cannot be drawn: the pane was opened without a message to show.",
  "props-version":
    "This message cannot be drawn: it was handed a snapshot of a version this display does not read.",
  "channel-version":
    "This message cannot be drawn: its content arrived in a form of the content channel this display does not read.",
  "content-unavailable": "This message cannot be drawn here: this pane was not given the message to show.",
  "content-absent": "No message is available to show for the revision being viewed.",
  "content-over-cap":
    "This message is too large to show here. Download it to read the whole message.",
  "content-unsupported-form": "This artifact is not a message, so the mail pane has nothing to draw.",
  "invalid-content-projection":
    "This message cannot be drawn: the content handed to this pane is incomplete.",
  "delivery-target":
    "A delivery target is a record of its own and projects nothing, so there is no message to read here.",
  "not-mail": "This artifact is not one of this pack's messages, so the mail pane has nothing to draw.",
  "render-failed": "This message could not be drawn.",
};

/** THE NAMED GAPS. Where something the pane draws is absent by right, the pane
 *  draws the gap IN THAT THING'S PLACE — never a blank plate, and never a note
 *  row appended beneath the work. */
export const EMAIL_DETAIL_GAP_SENTENCES = {
  sender: "No sending account is carried on this revision.",
  subject: "This revision carries no subject.",
  body: "This revision carries no message text.",
  date: "No date is carried on this revision.",
} as const;

/** THE NOTICES the pane draws ABOUT what it is drawing — never about the reader
 *  and never a note row of its own: each is drawn on the region it qualifies.
 *
 *  `truncated` — the content channel could not carry the whole message, so the
 *  pane is drawing a PREFIX and must say so rather than pass a cut document off
 *  as the message (the channel "degrades honestly", and the display is the half
 *  that says it out loud).
 *
 *  `live` / `snapshot` — the object-backed projection is discriminated on
 *  `source`, and the content contract's own words are that a display "receives a
 *  discriminated projection — the live object data, or a minted snapshot
 *  revision — AND SAYS WHICH OF THE TWO IT IS SHOWING": a live row may move
 *  under the reader, a snapshot is exactly what a decision binds, and a pane
 *  that drew them identically would label a moving row as reviewed work. */
export const EMAIL_DETAIL_NOTICE_SENTENCES = {
  truncated: "This message is too long to show in full here; this is its beginning.",
  live: "Live — this record can still change.",
  snapshot: "Snapshot — the revision this reading is pinned to.",
} as const;

/** The sending account, as the pane draws it. Never the address the message
 *  goes to: the recipient is a record of its own, which projects nothing. */
export type EmailDetailSender = {
  name: string | null;
  address: string | null;
  initials: string;
};

export type EmailDetailBody = {
  /** Safe html from the SDK's shared sanitizer. Never the message's markdown. */
  html: string;
  /** The markdown exactly as the store holds it — what an in-place edit sends
   *  back through the edit channel, which carries text and not markup. */
  markdown: string;
};

export type EmailDetailView =
  | {
      kind: "pane";
      recordKind: EmailRecordKind;
      /** Null where the projection carries no sending account at all. */
      sender: EmailDetailSender | null;
      /** ISO instant the pane names, and null where none is carried. */
      dateIso: string | null;
      subject: string | null;
      body: EmailDetailBody | null;
      /** THE STORED TEXT the editor sends back, held APART from the rendered
       *  body: a change set is the whole document, so the editor must open on
       *  the text the channel carried even where that text renders to no visible
       *  html at all. Null on the object arm, which carries no editable text. */
      editorText: string | null;
      /** Which of the object channel's two arms this pane is drawing, and null
       *  on the text arm, which is a pinned revision and neither of the two. */
      objectSource: "live" | "snapshot" | null;
      /** The pinned revision the pane is reading, when it is reading one. */
      revisionId: string | null;
      truncated: boolean;
      /** Is the body's text editable in the pane itself? True only on the
       *  artifact's own page (a granted capability), only for a draft body, and
       *  only over a text the channel carried whole. */
      editable: boolean;
    }
  | { kind: "floor"; reason: EmailDetailFloorReason };

/** A display must never throw on a shape it did not expect, so the input is
 *  accepted loosely and every surprise lands on the floor. */
export type EmailDetailRendererInput = Partial<ArtifactRendererProps> | null | undefined;

/** The sentence a reader sees for a floor. One per reason, all distinct. */
export function emailDetailFloorMessage(reason: EmailDetailFloorReason): string {
  return FLOOR_MESSAGES[reason] ?? FLOOR_MESSAGES["malformed-props"];
}
