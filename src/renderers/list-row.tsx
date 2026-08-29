// The LIBRARY-ROW GLYPH for the email pack's claimed types (slot `listRow`).
//
// The artifacts library draws one small square beside every row. For a row no
// extension claims the host draws its own generic mark; for a claimed row it
// asks the claiming extension, through the `listRow` slot, what the row IS. The
// host used to keep that answer for a handful of families in its own code — a
// mail row got a mail mark because the host knew the word "email". That map is
// gone: the answer belongs to the extension that owns the work.
//
// This is that answer for the email pack. The pack claims four kinds of thing,
// and each of them reads differently at a glance: a body a person wrote or is
// about to send, a message that WAS sent, a reply that came back, and a
// delivery target. One mark each, so a library full of email rows reads as the
// four kinds it is instead of one undifferentiated block — something the host's
// per-family map could never do, because it only ever knew the family.
//
// A v1 renderer requests no host ports and fetches nothing: it draws from the
// host-supplied snapshot alone. This slot is the smallest case of that — the
// host passes no content to a 34-pixel cell (a glyph draws none), so the row's
// object type is the whole input. The host owns the cell, its tint and its
// size; this component draws only what goes INSIDE it, and the host keeps its
// own mark underneath so the cell can never come out empty.

import type { ReactElement } from "react";
import { Mail, MailCheck, MailOpen, Users } from "lucide-react";

import type { ArtifactRendererProps } from "@cinatra-ai/sdk-extensions";

/** The host's props snapshot, narrowed to what a glyph reads. A `listRow`
 * renderer needs the row's object type and nothing else — but the field is
 * DERIVED from the SDK's versioned `ArtifactRendererProps` rather than
 * re-typed by hand, so a rename or removal of `artifact.objectType` in the
 * props contract this renderer declares (`propsApiVersion: 1`) fails this
 * pack's own typecheck instead of drifting silently (cinatra#3095). */
export type EmailArtifactsListRowProps = {
  artifact: Pick<ArtifactRendererProps["artifact"], "objectType">;
};

const GLYPH_BY_TYPE: Record<string, typeof Mail> = {
  "@cinatra-ai/email:body": Mail,
  "@cinatra-ai/email:sent-email": MailCheck,
  "@cinatra-ai/email:received-reply": MailOpen,
  "@cinatra-ai/email:recipient": Users,
};

export default function EmailArtifactsListRow({
  artifact,
}: EmailArtifactsListRowProps): ReactElement {
  const Glyph = GLYPH_BY_TYPE[artifact?.objectType] ?? Mail;
  return <Glyph aria-hidden className="size-[17px]" data-email-glyph={artifact?.objectType} />;
}
