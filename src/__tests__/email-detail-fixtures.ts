// Fixture props snapshots for the email body display's own tests.
//
// A display is handed ONE thing by the host — the versioned, already
// access-checked props snapshot — so its tests build that snapshot and nothing
// else: no host, no boot, no store. The two shapes below are the two the
// display is drawn from: the TEXT projection a draft body carries, and the
// OBJECT projection the two email record types carry.

import type { ArtifactRendererProps } from "@cinatra-ai/sdk-extensions";
import { ARTIFACT_CONTENT_CHANNEL_VERSION } from "@cinatra-ai/sdk-extensions/artifact-content-channel";
import {
  ARTIFACT_EDIT_CHANNEL_VERSION,
  ARTIFACT_EDIT_IDLE_PAUSE_MS,
  ARTIFACT_EDIT_TEXT_CAP_BYTES,
  type ArtifactEditCapability,
} from "@cinatra-ai/sdk-extensions/artifact-edit-channel";

export const REVISION_ID = "rev_4c21aa";

export const BODY_MARKDOWN =
  "Hi there — following up on the pilot we scoped last quarter.\n\nAre you open to a short call next week?";

export const readOnlyEdit: ArtifactEditCapability = {
  kind: "read-only",
  channelVersion: ARTIFACT_EDIT_CHANNEL_VERSION,
  reason: "read-only-surface",
};

export const editableEdit: ArtifactEditCapability = {
  kind: "editable",
  channelVersion: ARTIFACT_EDIT_CHANNEL_VERSION,
  artifactId: "art_1",
  baseRevisionId: REVISION_ID,
  saveUrl: "/api/artifacts/art_1/edit",
  idlePauseMs: ARTIFACT_EDIT_IDLE_PAUSE_MS,
  capBytes: ARTIFACT_EDIT_TEXT_CAP_BYTES,
};

/** The same capability, minted at another revision — what the host hands an
 *  editor that reopened the artifact after it moved on. */
export function editableEditAt(baseRevisionId: string, artifactId = "art_1"): ArtifactEditCapability {
  return {
    kind: "editable",
    channelVersion: ARTIFACT_EDIT_CHANNEL_VERSION,
    artifactId,
    baseRevisionId,
    saveUrl: `/api/artifacts/${artifactId}/edit`,
    idlePauseMs: ARTIFACT_EDIT_IDLE_PAUSE_MS,
    capBytes: ARTIFACT_EDIT_TEXT_CAP_BYTES,
  };
}

function baseProps(objectType: string, artifactId = "art_1"): Omit<ArtifactRendererProps, "content" | "edit"> {
  return {
    propsApiVersion: 1,
    artifact: {
      id: artifactId,
      title: "Re-connecting on Q3 priorities",
      objectType,
      mime: "text/markdown",
      size: BODY_MARKDOWN.length,
      createdAt: "2026-08-14T12:12:00.000Z",
      updatedAt: "2026-08-14T12:12:00.000Z",
      ownerLevel: "team",
      visibility: "private",
      sourceUrl: null,
    },
    representation: { revisionId: REVISION_ID, mime: "text/markdown" },
    urls: { preview: null, download: null },
    identity: { kind: "extension", extension: "@cinatra-ai/email-artifacts" },
    actions: { download: null, openInSource: null },
  };
}

/** A DRAFT BODY, as the content channel projects it: the text arm. */
export function bodyProps(
  over: {
    markdown?: string;
    edit?: ArtifactEditCapability;
    title?: string | null;
    truncated?: boolean;
    artifactId?: string;
  } = {},
): ArtifactRendererProps {
  const markdown = over.markdown ?? BODY_MARKDOWN;
  const base = baseProps("@cinatra-ai/email:body", over.artifactId ?? "art_1");
  return {
    ...base,
    artifact: { ...base.artifact, title: over.title === undefined ? base.artifact.title : over.title },
    content: {
      kind: "text",
      channelVersion: ARTIFACT_CONTENT_CHANNEL_VERSION,
      representationRevisionId: REVISION_ID,
      text: markdown,
      encoding: "utf-8",
      byteLength: markdown.length,
      projectedByteLength: markdown.length,
      cap: 256 * 1024,
      truncated: over.truncated ?? false,
    },
    edit: over.edit ?? readOnlyEdit,
  };
}

/** An OBJECT-BACKED row — the two email record types, and the delivery target. */
export function objectProps(
  objectType: string,
  data: Record<string, unknown>,
  over: { source?: "live" | "snapshot"; edit?: ArtifactEditCapability } = {},
): ArtifactRendererProps {
  const base = baseProps(objectType);
  const source = over.source ?? "live";
  const common = {
    kind: "object" as const,
    channelVersion: ARTIFACT_CONTENT_CHANNEL_VERSION,
    objectType,
    data,
    digest: "sha256-fixture",
    byteLength: 120,
    projectedByteLength: 120,
    cap: 256 * 1024,
  };
  return {
    ...base,
    content:
      source === "snapshot"
        ? { ...common, source: "snapshot", representationRevisionId: REVISION_ID }
        : { ...common, source: "live", representationRevisionId: null },
    edit: over.edit ?? readOnlyEdit,
  };
}

export const SENT_EMAIL_DATA = {
  auditId: "aud_1",
  idempotencyKey: "idem_1",
  connectorId: "conn_1",
  fromEmail: "anna.keller@acme.example",
  fromName: "Anna Keller",
  toEmail: "someone@example.test",
  subject: "Re-connecting on Q3 priorities",
  bodyMarkdown: BODY_MARKDOWN,
  providerMessageId: "msg_1",
  sentAt: "2026-08-14T12:12:00.000Z",
};

export const RECEIVED_REPLY_DATA = {
  connectorId: "conn_1",
  providerMessageId: "msg_2",
  fromEmail: "anna.keller@acme.example",
  fromName: "Anna Keller",
  subject: "Re-connecting on Q3 priorities",
  snippet: BODY_MARKDOWN,
  receivedAt: "2026-08-14T12:12:00.000Z",
};
