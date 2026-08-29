import type { SemanticArtifactManifest } from "@cinatra-ai/sdk-extensions";

// `@cinatra-ai/email-artifacts` — the merged email work-product PACK (epic
// cinatra#1448, rescopes #1434). It ABSORBS the former single-type
// `@cinatra-ai/email-body-artifact` (its bytes-only email-body matcher moves
// here unchanged) and, in HYBRID mode, additionally CLAIMS the four atomic
// email object types under the provider-neutral `@cinatra-ai/email` namespace:
//
//   - email:body           [draftable] — the reusable body of a sent/retained
//                          email message (absorbs email-body-artifact; the
//                          matcher below asserts it). draftable: content edits
//                          are allowed only while a row is a draft, then it
//                          locks (the draft→scheduled→published state machine +
//                          publish receipts ride the publication-operation
//                          ledger, cinatra#1450/#1774 — declared here, enforced
//                          by that write-path owner).
//   - email:sent-email     [record] — the semantic record of a meaningful send.
//   - email:received-reply [record] — an inbound reply observation.
//   - email:recipient      [record] — a run-scoped delivery-target SNAPSHOT
//                          (never a person/contact; CRM ids are connector-scoped
//                          soft provenance only, no CRM writeback). `record`:
//                          create-only, immutable.
//
// NO email:thread claim — thread views are correlation queries over the
// sent/reply records, not an atomic artifact. NO campaign-bundle / send-attempt
// / sender-identity claims — those stay non-artifact run machinery.
//
// The four claims (kind, per-claim dispositions incl. mutability class, and the
// inline row JSON Schema each carries as its schema-source) are the manifest of
// record in `package.json` `cinatra.artifact.objectTypes`; the object-registry
// bridge reads them there. This typed export mirrors that manifest IN FULL —
// the descriptor (representation forms + matcher bundle) AND all four
// `objectTypes` claims — against the SDK `SemanticArtifactManifest` contract,
// so the two cannot diverge.
//
// Bytes-only matcher: text/markdown + text/plain. text/html is not in the LLM
// capability registry.
export const emailArtifactsManifest: SemanticArtifactManifest = {
  // THE LIBRARY-ROW GLYPH (slot `listRow`, cinatra#3095). The artifacts library
  // asks a claimed row's own extension what the row is; this pack answers with
  // one mark per claimed kind (see `src/renderers/list-row.tsx`). The slot is an
  // OPTION an extension may take — no gate requires it, and a row whose
  // extension declares none keeps the host's generic mark. Mirrors
  // `package.json` `cinatra.artifact.ui`, which is the manifest of record.
  ui: {
    abiVersion: 1,
    sdkAbiRange: "^2.5.0",
    renderers: {
      listRow: {
        entry: "./src/renderers/list-row.tsx",
        propsApiVersion: 1,
      },
    },
  },
  accepts: {
    file: {
      mimeTypes: ["text/markdown", "text/plain"],
    },
  },
  skills: {
    matchers: ["@cinatra-ai/email-body-matcher-skill:email-body-matcher"],
  },
  matcherConfidenceThreshold: 0.7,
  objectTypes: [
    {
      type: "@cinatra-ai/email:body",
      claim: "dedicated",
      dispositions: {
        projection: "artifact-safe",
        pinnable: true,
        snapshotPolicy: "content",
        sensitivity: "normal",
        mutability: "draftable",
      },
      schema: {
        type: "object",
        properties: {
          subject: {
            type: "string",
          },
          bodyMarkdown: {
            type: "string",
          },
          connectorId: {
            type: "string",
          },
          campaignId: {
            type: "string",
          },
          contactId: {
            type: "string",
          },
          runId: {
            type: "string",
          },
        },
        additionalProperties: true,
      },
    },
    {
      type: "@cinatra-ai/email:sent-email",
      claim: "dedicated",
      dispositions: {
        projection: "artifact-safe",
        pinnable: false,
        snapshotPolicy: "metadata",
        sensitivity: "normal",
        mutability: "record",
      },
      schema: {
        type: "object",
        properties: {
          auditId: {
            type: "string",
            minLength: 1,
          },
          idempotencyKey: {
            type: "string",
            minLength: 1,
          },
          connectorId: {
            type: "string",
            minLength: 1,
          },
          fromEmail: {
            type: "string",
          },
          toEmail: {
            type: "string",
            minLength: 1,
          },
          subject: {
            type: "string",
            minLength: 1,
          },
          providerMessageId: {
            type: "string",
            minLength: 1,
          },
          providerThreadId: {
            type: "string",
          },
          internetMessageId: {
            type: "string",
          },
          sentAt: {
            type: "string",
            minLength: 1,
          },
          campaignId: {
            type: "string",
          },
          contactId: {
            type: "string",
          },
          runId: {
            type: "string",
          },
        },
        required: [
          "auditId",
          "idempotencyKey",
          "connectorId",
          "toEmail",
          "subject",
          "providerMessageId",
          "sentAt",
        ],
        additionalProperties: true,
      },
    },
    {
      type: "@cinatra-ai/email:received-reply",
      claim: "dedicated",
      dispositions: {
        projection: "artifact-safe",
        pinnable: false,
        snapshotPolicy: "metadata",
        sensitivity: "normal",
        mutability: "record",
      },
      schema: {
        type: "object",
        properties: {
          connectorId: {
            type: "string",
            minLength: 1,
          },
          providerMessageId: {
            type: "string",
            minLength: 1,
          },
          providerThreadId: {
            type: "string",
          },
          internetMessageId: {
            type: "string",
          },
          fromEmail: {
            type: "string",
            minLength: 1,
          },
          subject: {
            type: "string",
            minLength: 1,
          },
          snippet: {
            type: "string",
          },
          receivedAt: {
            type: "string",
            minLength: 1,
          },
          threadId: {
            type: "string",
          },
          contactId: {
            type: "string",
          },
          campaignId: {
            type: "string",
          },
        },
        required: [
          "connectorId",
          "providerMessageId",
          "fromEmail",
          "subject",
          "receivedAt",
        ],
        additionalProperties: true,
      },
    },
    {
      type: "@cinatra-ai/email:recipient",
      claim: "dedicated",
      dispositions: {
        projection: "none",
        pinnable: false,
        snapshotPolicy: "none",
        sensitivity: "sensitive",
        mutability: "record",
      },
      schema: {
        type: "object",
        properties: {
          runId: {
            type: "string",
            minLength: 1,
          },
          connectorId: {
            type: "string",
          },
          contactKey: {
            type: "string",
          },
          email: {
            type: "string",
            minLength: 1,
            pattern: "\\S",
          },
          campaignId: {
            type: "string",
          },
          confirmed: {
            type: "boolean",
          },
        },
        required: ["runId", "email"],
        additionalProperties: true,
      },
    },
  ],
};
