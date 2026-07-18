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
// bridge reads them there. This typed export mirrors only the DESCRIPTOR half
// (representation forms + matcher bundle) — the SDK `SemanticArtifactManifest`
// contract the bridge type-checks the descriptor against; the `objectTypes`
// claim block is validated host-side by the objects manifest schema.
//
// Bytes-only matcher: text/markdown + text/plain. text/html is not in the LLM
// capability registry.
export const emailArtifactsManifest: SemanticArtifactManifest = {
  accepts: {
    file: {
      mimeTypes: ["text/markdown", "text/plain"],
    },
  },
  skills: {
    matchers: ["@cinatra-ai/email-artifacts:email-body-matcher"],
  },
  matcherConfidenceThreshold: 0.7,
};
