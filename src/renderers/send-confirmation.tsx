"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";

// Pure snapshot -> render renderer for the send-confirmation SHELL (cinatra#1961).
// Relocated out of the core host renderer
// (packages/agents/src/send-confirmation-renderer.tsx) into this pack under the
// #1923 cross-declarer pattern + the owner action-boundary ruling.
//
// ACTION DECOUPLING (the load-bearing change): the shell no longer imports the
// authenticated host actions `fetchCampaignRecipients` / `fetchInitialDrafts`
// (an agent extension may import only @cinatra-ai/sdk-extensions +
// @cinatra-ai/sdk-ui — the host `email-outreach-stage-actions` is unreachable).
// The recipient/draft summary renders PURELY from the gate-supplied snapshot
// (`value.summary`, surfaced pre-interrupt by the email-delivery gate). This is
// a read/render decoupling ONLY — no mutation is restructured (the send routes
// through the #1946-fixed primitive path, out of scope here).
//
// SENDER IS DISPLAY-ONLY (owner ruling 2026-07-23 (groganz), option (a);
// cinatra#1961 follow-up F2). The send always uses the campaign-configured
// sender: the email-delivery flow wires `senderEmail` to the send node straight
// from the `start` inputs (the DataFlowEdge start_senderEmail_to_send), NOT from
// this gate's approval payload — the gate's only output is `userResponse`, which
// reaches no send input. An editable sender field here was therefore a lie: its
// edit was emitted into the approval payload but never honored. So the shell now
// renders the sender as PLAIN READ-ONLY DATA in the campaign summary — no input
// affordance, and `senderEmail` is NOT part of the emitted (editable) payload.
// The gate still SURFACES `senderEmail` (surfaceGateInputs) purely so this row
// can display the exact sender that will be used; we keep it in the displayed
// summary. midRunHitl stays: the confirmation is unchanged, only the false
// editability is removed.

// Preloaded summary shape carried in the gate's interrupt payload.
type SendSummary = { recipientCount?: number; draftCount?: number; scheduledAt?: string };

export function SendConfirmationRenderer({ value, onChange }: FieldRendererProps) {
  // Stable ref for onChange so the sync effect never captures a stale closure
  // when the run panel recreates the callback on re-render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Gate-supplied summary snapshot (no host fetch). Absent -> em-dash cells.
  //
  // SELF-ERASURE GUARD (cinatra#1961): the sync effect below re-emits the
  // approval payload through onChange, and the run panel REPLACES `value` with
  // exactly that emitted object. The email-delivery gate surfaces `summary` ONLY
  // on the pre-interrupt visit (surfaceGateInputs), so any emit that dropped it
  // collapsed the recipient/draft counts to em-dashes on the very next controlled
  // re-render. Latch the first non-empty snapshot in a ref so the display survives
  // ANY external value rewrite, and (below) echo it back in every emit so
  // value.summary round-trips and the resolved approval payload carries it. Either
  // channel alone fixes the counts; both make them robust.
  const incomingSummary = (value as { summary?: SendSummary } | null)?.summary;
  const summaryRef = useRef<SendSummary | undefined>(incomingSummary);
  if (incomingSummary !== undefined) summaryRef.current = incomingSummary;
  const summary = summaryRef.current;
  const recipientCount = summary?.recipientCount;
  const draftCount = summary?.draftCount;
  const scheduledAt = summary?.scheduledAt;
  const campaignId = (value as { campaignId?: string } | null)?.campaignId;

  // Read-only sender for DISPLAY, latched in STATE (never a render-written ref:
  // React forbids reading/writing a ref during render, and an abandoned concurrent
  // render could otherwise leak an uncommitted address into a later sender-less
  // echo, making the confirmation untruthful — codex 2026-07-23). Same surfacing
  // lifecycle as `summary`: the gate surfaces `senderEmail` only pre-interrupt and
  // the emit below intentionally OMITS it (display-only), so the value rewrite that
  // follows the emit drops `value.senderEmail`; the truthy-guarded latch keeps the
  // row populated across that self-erasure, and never emits it back (no editable
  // senderEmail — owner ruling 2026-07-23). Scoped to campaignId so a campaign
  // switch never shows the prior campaign's sender. State is adjusted DURING render
  // (React's sanctioned reset/derive-on-prop-change pattern), so the displayed
  // address is synchronous with no effect lag.
  const incomingSenderEmail = (value as { senderEmail?: string } | null)?.senderEmail;
  const [latchedSender, setLatchedSender] = useState<{ campaignId?: string; email?: string }>({
    campaignId,
    email: incomingSenderEmail || undefined,
  });
  let senderEmail = latchedSender.email;
  if (latchedSender.campaignId !== campaignId) {
    // Campaign changed under this instance — reseed with the new campaign's sender.
    setLatchedSender({ campaignId, email: incomingSenderEmail || undefined });
    senderEmail = incomingSenderEmail || undefined;
  } else if (incomingSenderEmail && incomingSenderEmail !== latchedSender.email) {
    // Latch the first/latest non-empty sender for this campaign.
    setLatchedSender({ campaignId, email: incomingSenderEmail });
    senderEmail = incomingSenderEmail;
  }

  // Keep the approval payload in sync with campaignId (+ the latched summary).
  // Read through onChangeRef so the effect always calls the latest callback
  // without adding onChange to the dep array, avoiding stale-closure re-fires. The
  // dep is a single PRIMITIVE (the stable campaignId string), so a parent
  // re-render with a fresh `value` object literal does not re-fire this effect —
  // no render loop. senderEmail is DELIBERATELY absent from the emitted payload:
  // the send uses the campaign-configured sender (see the header note), so the
  // gate must not carry an editable sender.
  useEffect(() => {
    if (campaignId) {
      // Read the latched summary through the ref (a ref access is exempt from the
      // effect dep array, so this does NOT re-fire on summary churn). Omitted
      // entirely when absent so the payload shape is byte-unchanged for the
      // no-summary case.
      const s = summaryRef.current;
      onChangeRef.current({
        campaignId,
        ...(s !== undefined ? { summary: s } : {}),
      });
    }
  }, [campaignId]);

  if (!campaignId) {
    return (
      <p className="text-sm text-muted-foreground">
        No campaign selected yet. Complete the previous setup steps first.
      </p>
    );
  }

  return (
    <div className="soft-panel flex flex-col gap-4 p-4">
      {/* Campaign summary — rendered PURELY from the gate-supplied snapshot. */}
      <div className="soft-panel flex flex-col gap-2 p-3">
        <span className="text-sm font-medium text-foreground">Campaign Summary</span>
        <div className="flex flex-col gap-1 text-sm text-foreground">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Campaign ID</span>
            <span>{campaignId}</span>
          </div>
          {/* Sender — READ-ONLY (owner ruling 2026-07-23). The exact sender the
              send will use, surfaced by the gate (surfaceGateInputs) for display
              only; never an input, never emitted. Rendered only when the gate
              supplied a sender, mirroring the Scheduled row (no dead em-dash cell). */}
          {senderEmail ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Sender</span>
              <span>{senderEmail}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Recipients</span>
            <span>{recipientCount ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Drafts</span>
            <span>{draftCount ?? "—"}</span>
          </div>
          {/* Scheduled send time — surfaced by the gate snapshot (summary.scheduledAt).
              Rendered only when the prepare step supplied a non-empty value; an
              immediate send omits the row entirely (no dead em-dash cell). */}
          {scheduledAt ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Scheduled</span>
              <span>{scheduledAt}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Warning */}
      <p className="text-sm text-destructive font-medium">
        Approving will send real emails to all recipients and cannot be undone.
      </p>
    </div>
  );
}

export default SendConfirmationRenderer;
