// THE EMAIL BODY'S HTML. This is the one module of the pack that reaches the
// SDK's shared markdown sanitizer, and the one place its output enters the
// page. The html written below is the sanitizer's own output and nothing else.
// The repository's check suite names this file as security-bearing; the view
// and the display beside it keep layout, fields and editing.

import type { ReactElement } from "react";

import { renderSanitizedMarkdown } from "@cinatra-ai/sdk-extensions/markdown-sanitizer";

/** Render the message's markdown to safe html, headings one level down. */
export function renderEmailBodyHtml(markdown: string): string {
  return renderSanitizedMarkdown(markdown, { demoteHeadings: true });
}

/** The one element that writes the sanitized html into the page. */
export function EmailBodyHtml({ html }: { html: string }): ReactElement {
  return (
    // The html is the SDK sanitizer's own output and nothing else — the
    // one boundary this pack runs somebody else's document through.
    <div
      data-region="body"
      className="text-sm leading-relaxed text-foreground [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
