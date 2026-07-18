# Email Artifacts

The merged email artifacts pack for Cinatra. It holds the reusable body of an email message alongside the operational records of what was actually sent and received — sent-email records, received-reply observations, and run-scoped recipient snapshots — so proven message language stays searchable and every send and reply is an addressable artifact in the library.

Install this pack via the Cinatra marketplace. Once installed, upload a Markdown or plain-text file to the library and the built-in `email-body-matcher` skill classifies message-shaped documents as an email body automatically (confidence floor 0.7); the sent-email, received-reply, and recipient records are written by the email send and reply-watching machinery during a campaign run. Recipient snapshots are minimal, run-scoped delivery targets — never a person or contact record — and their addresses are kept out of the derived search index. For local development, run `node extension-kind-gate.mjs --package-root .` at the repo root and confirm zero errors before submitting to the marketplace.

## Works with

- Email Drafting agent
- Email Outreach agent
- Email Delivery agent
- Email Follow-up agent
- Email Recipient Selection agent

## Capabilities

- Save the body of a real or template email for future reuse and drafting
- Search past messages to find proven language for a new draft
- Keep an addressable record of every meaningful send and inbound reply
- Snapshot the confirmed delivery targets of a campaign run without writing back to a CRM
- Attach any email artifact as reference context when briefing a drafting agent
