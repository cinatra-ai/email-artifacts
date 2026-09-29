// The decision leaf the mail detail pane draws from: it maps the host's
// authorized props snapshot to exactly one of two outcomes, and it is the ONE
// module in this package that reaches the sanitizer.
//
//   `pane`  — the message, region by region, with its body already rendered to
//             safe html by the SDK's shared markdown sanitizer.
//   `floor` — a NAMED reason there is nothing to draw. Never blank, never a
//             throw: a display that threw would take the surface down with it.
//
// NOTHING IS SANITIZED HERE. The html comes from the one shared sanitizer in
// the SDK leaf and from nowhere else; this module chooses whether to ask for it
// and what to say when there is nothing to ask about.
//
// TWO PROJECTIONS, ONE PANE. A draft body arrives on the content channel's TEXT
// projection — the markdown of the message. The two email record types arrive
// on the OBJECT projection — the row's own structured data, live or snapshot —
// and are drawn through the same chrome, read only throughout.

import { isArtifactEditGranted } from "@cinatra-ai/sdk-extensions/artifact-edit-channel";
import { renderSanitizedMarkdown } from "@cinatra-ai/sdk-extensions/markdown-sanitizer";
import { ARTIFACT_CONTENT_CHANNEL_VERSION } from "@cinatra-ai/sdk-extensions/artifact-content-channel";
import type { ArtifactRendererProps } from "@cinatra-ai/sdk-extensions";

import {
  EMAIL_BODY_TYPE,
  EMAIL_DISPLAY_PROPS_API_VERSION,
  EMAIL_RECEIVED_REPLY_TYPE,
  EMAIL_RECIPIENT_TYPE,
  EMAIL_SENT_EMAIL_TYPE,
  type EmailDetailBody,
  type EmailDetailFloorReason,
  type EmailDetailRendererInput,
  type EmailDetailSender,
  type EmailDetailView,
  type EmailRecordKind,
} from "./email-detail-contract";
import { readEmailBodySender } from "./email-body-sender";

export {
  EMAIL_DETAIL_GAP_SENTENCES,
  EMAIL_DETAIL_NOTICE_SENTENCES,
  EMAIL_DISPLAY_PROPS_API_VERSION,
  emailDetailFloorMessage,
} from "./email-detail-contract";
export type {
  EmailDetailFloorReason,
  EmailDetailRendererInput,
  EmailDetailSender,
  EmailDetailView,
  EmailRecordKind,
} from "./email-detail-contract";

function floor(reason: EmailDetailFloorReason): EmailDetailView {
  return { kind: "floor", reason };
}

const RECORD_KIND_BY_TYPE: Record<string, EmailRecordKind> = {
  [EMAIL_BODY_TYPE]: "body",
  [EMAIL_SENT_EMAIL_TYPE]: "sent-email",
  [EMAIL_RECEIVED_REPLY_TYPE]: "received-reply",
};

/** THE TABLE IS A CLOSED SET, and `in`/indexing is not. A plain object inherits
 *  `constructor`, `toString` and the rest from its prototype, so indexing this
 *  table with an object type of "constructor" hands back a truthy value that is
 *  no record kind at all — and the pane would draw an unknown row as mail. A
 *  non-string type is worse: converting it to a property key runs somebody
 *  else's `toString`, which can throw inside a resolver that promises never to.
 *  So: a string, and an OWN key of this table, or no kind. */
function recordKindOf(objectType: unknown): EmailRecordKind | null {
  if (typeof objectType !== "string") return null;
  return Object.prototype.hasOwnProperty.call(RECORD_KIND_BY_TYPE, objectType)
    ? RECORD_KIND_BY_TYPE[objectType]!
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * THE INITIALS, and never a picture. The drawing: "the avatar is the sender's
 * initials set in a plain disc, never an image" — so the disc needs letters
 * whenever the pane has a sending account at all. A name gives its first and
 * last word's initials; an account with no name gives the first letters its
 * address separates.
 */
export function emailSenderInitials(name: string | null, address: string | null): string {
  const source = name ?? (address ? address.split("@")[0] : null);
  if (!source) return "";
  const words = source.split(/[\s._-]+/u).filter((word) => word.length > 0);
  if (words.length === 0) return "";
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : "";
  return (first + last).toLocaleUpperCase();
}

function senderFrom(data: Record<string, unknown>): EmailDetailSender | null {
  const name = str(data.fromName) ?? str(data.senderName);
  const address = str(data.fromEmail) ?? str(data.senderEmail);
  if (!name && !address) return null;
  return { name, address, initials: emailSenderInitials(name, address) };
}

/** Render the message's markdown to safe html. A failure inside somebody else's
 *  document becomes a named floor and nothing else — no markup from a failed
 *  render is ever drawn. */
function bodyFrom(markdown: string | null): { body: EmailDetailBody | null } | { reason: "render-failed" } {
  if (markdown === null) return { body: null };
  let html: string;
  try {
    html = renderSanitizedMarkdown(markdown, { demoteHeadings: true });
  } catch {
    return { reason: "render-failed" };
  }
  if (typeof html !== "string" || html.trim().length === 0) return { body: null };
  return { body: { html, markdown } };
}

/** Resolve what the pane draws. Total: it returns a view for every input. */
export function resolveEmailDetailView(props: EmailDetailRendererInput): EmailDetailView {
  if (props === null || props === undefined || typeof props !== "object" || Array.isArray(props)) {
    return floor("malformed-props");
  }

  const snapshot = props as Partial<ArtifactRendererProps>;

  // STRICT, in both directions: a snapshot that does not SAY which version it
  // was built at is as unreadable as one built at another version.
  if (snapshot.propsApiVersion !== EMAIL_DISPLAY_PROPS_API_VERSION) return floor("props-version");

  const artifact = snapshot.artifact;
  if (artifact === null || artifact === undefined || typeof artifact !== "object") {
    return floor("malformed-props");
  }

  const objectType = artifact.objectType;
  if (objectType === EMAIL_RECIPIENT_TYPE) return floor("delivery-target");
  const recordKind = recordKindOf(objectType);
  if (recordKind === null) return floor("not-mail");

  const content = snapshot.content;
  if (content === null || content === undefined || typeof content !== "object") {
    // The snapshot carried no projection at all — a surface that does not hand
    // its displays content. Held APART from a projection that says, itself,
    // that there is nothing stored.
    return floor("content-unavailable");
  }
  if (content.channelVersion !== ARTIFACT_CONTENT_CHANNEL_VERSION) return floor("channel-version");

  const projection = content as { [key: string]: unknown };
  const kind = projection.kind;

  if (kind === "none") {
    const reason = projection.reason;
    if (reason === "over-cap") return floor("content-over-cap");
    if (reason === "unsupported-form") return floor("content-unsupported-form");
    if (reason === "absent") return floor("content-absent");
    return floor("invalid-content-projection");
  }

  if (kind === "configuration" || kind === "page") return floor("content-unsupported-form");

  const granted = isArtifactEditGranted(snapshot.edit);

  if (kind === "text") {
    const text = projection.text;
    const contentRevisionId = projection.representationRevisionId;
    const truncated = projection.truncated;
    if (
      typeof text !== "string" ||
      typeof contentRevisionId !== "string" ||
      contentRevisionId.length === 0 ||
      typeof truncated !== "boolean" ||
      projection.encoding !== "utf-8"
    ) {
      return floor("invalid-content-projection");
    }

    // THE PINNED REVISION AND THE DRAWN REVISION ARE THE SAME ONE, or nothing
    // is drawn: labelling one revision's words with another's is worse than
    // drawing nothing.
    const representation = snapshot.representation as { revisionId?: unknown } | null | undefined;
    if (
      representation === null ||
      representation === undefined ||
      typeof representation !== "object" ||
      representation.revisionId !== contentRevisionId
    ) {
      return floor("invalid-content-projection");
    }

    // THE CONTENT NAMES ITS SENDING ACCOUNT in the head line before the
    // message; the message after the head is what the pane renders, and a
    // content that names none draws the named gap in the sender's place.
    const parts = readEmailBodySender(text);
    const rendered = bodyFrom(parts.body.trim().length > 0 ? parts.body : null);
    if ("reason" in rendered) return floor(rendered.reason);

    return {
      kind: "pane",
      recordKind,
      sender:
        parts.sender === null
          ? null
          : { ...parts.sender, initials: emailSenderInitials(parts.sender.name, parts.sender.address) },
      dateIso: str(artifact.createdAt),
      subject: str(artifact.title),
      body: rendered.body,
      // THE EDITOR OPENS ON THE STORED TEXT, not on whatever the sanitizer had
      // left to draw. A document of only whitespace, and a document whose
      // markup all falls away in the sanitizer, both render to nothing — and an
      // editor that opened empty on either would send that emptiness back as
      // the whole document the moment the reader touched it.
      // The head is held apart and written back in front of every save.
      editorText: parts.body,
      editorHead: parts.head,
      objectSource: null,
      revisionId: contentRevisionId,
      truncated,
      // A RECORD IS NEVER EDITED, whatever the surface minted: a sent message
      // and a reply are read, not drafted.
      editable: recordKind === "body" && granted && !truncated,
    };
  }

  if (kind !== "object") return floor("invalid-content-projection");

  const data = projection.data;
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    return floor("invalid-content-projection");
  }
  // THE ROW THE PANE IS DRAWING IS THE ROW THE SURFACE NAMED, or the pane is
  // about to label one type's data with another's.
  if (projection.objectType !== objectType) return floor("invalid-content-projection");

  // THE DISCRIMINATOR THE CONTENT CONTRACT PINS: an object projection is the
  // live row or a minted snapshot, and it SAYS WHICH. The two arms carry
  // different revision shapes by the type — live names none, a snapshot names
  // one — so a projection whose pair does not hold is not one this channel
  // mints, and the pane draws nothing rather than labelling a moving row as the
  // revision a decision binds.
  const source: "live" | "snapshot" | null =
    projection.source === "live" ? "live" : projection.source === "snapshot" ? "snapshot" : null;
  if (source === null) return floor("invalid-content-projection");
  const objectRevisionId = projection.representationRevisionId;
  if (source === "live" && objectRevisionId !== null && objectRevisionId !== undefined) {
    return floor("invalid-content-projection");
  }
  if (source === "snapshot" && (typeof objectRevisionId !== "string" || objectRevisionId.length === 0)) {
    return floor("invalid-content-projection");
  }

  const row = data as Record<string, unknown>;
  const rendered = bodyFrom(str(row.bodyMarkdown) ?? str(row.snippet));
  if ("reason" in rendered) return floor(rendered.reason);

  return {
    kind: "pane",
    recordKind,
    sender: senderFrom(row),
    dateIso: str(row.sentAt) ?? str(row.receivedAt) ?? str(artifact.createdAt),
    subject: str(row.subject) ?? str(artifact.title),
    body: rendered.body,
    // AN OBJECT ROW CARRIES NO EDITABLE DOCUMENT TEXT: its substance is the row.
    editorText: null,
    editorHead: "",
    objectSource: source,
    revisionId: source === "snapshot" ? (objectRevisionId as string) : null,
    truncated: false,
    // AN OBJECT-BACKED ROW TAKES NO EDIT HERE. The edit channel carries TEXT
    // against a pinned representation; an object row's substance is the row
    // itself, and there is no road on the contract that writes one field of it.
    editable: false,
  };
}
