"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";
import { GmailSenderFieldRenderer } from "./gmail-sender";

// Pure snapshot -> render + onChange renderer for the send-confirmation SHELL
// (cinatra#1961). Relocated out of the core host renderer
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
// The embedded sender field keeps the #1923 floor contract: gmail CONNECTED
// (aliases present) mirrors the host gmail-sender activation condition and
// renders the pack `gmail-sender` Select; gmail DISCONNECTED renders an EAGER
// inline <input id="field-senderEmail"> that commits every keystroke to the
// approval payload immediately (never the buffering schema floor, so a typed
// address is never lost on approval — codex 2026-07-21, preserved from #1923).
// Both sender renderers now live in THIS pack, so the shell composes the sibling
// GmailSenderFieldRenderer DIRECTLY — an extension cannot import the host
// field-renderer registry, so the registry lookup is replaced by the same
// activation predicate the host condition applied to this `senderEmail` field.

// Preloaded summary shape carried in the gate's interrupt payload.
type SendSummary = { recipientCount?: number; draftCount?: number; scheduledAt?: string };

export function SendConfirmationRenderer({
  value,
  onChange,
  disabled,
  context,
  aiSuggestions,
}: FieldRendererProps) {
  // Stable ref for onChange so the sync effects never capture a stale closure
  // when the run panel recreates the callback on re-render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Tracks the last senderEmail synced from the parent so poll-tick reference
  // churn (same content, new object) does not reset a user-typed value.
  const lastSyncedEmailRef = useRef<string>(
    (value as { senderEmail?: string } | null)?.senderEmail ?? "",
  );

  // Gate-supplied summary snapshot (no host fetch). Absent -> em-dash cells.
  const summary = (value as { summary?: SendSummary } | null)?.summary;
  const recipientCount = summary?.recipientCount;
  const draftCount = summary?.draftCount;
  const campaignId = (value as { campaignId?: string } | null)?.campaignId;

  const [senderEmail, setSenderEmail] = useState<string>(
    (value as { senderEmail?: string } | null)?.senderEmail ?? "",
  );

  // Keep the approval payload in sync with campaignId + senderEmail. Read through
  // onChangeRef so the effect always calls the latest callback without adding
  // onChange to the dep array, avoiding stale-closure re-fires. Deps are PRIMITIVE
  // (a stable campaignId string + local senderEmail), so a parent re-render with a
  // fresh `value` object literal does not re-fire this effect — no render loop.
  useEffect(() => {
    if (campaignId) onChangeRef.current({ campaignId, senderEmail: senderEmail || undefined });
  }, [campaignId, senderEmail]);

  // Sync `senderEmail` when an AI suggestion arrives from the parent's sticky
  // bottom prompt. `aiSuggestions` is a stable payload — it only changes when the
  // user submits a prompt — so this fires exactly once per Suggest click and does
  // not wipe in-progress user edits between polls.
  useEffect(() => {
    if (!aiSuggestions) return;
    if (typeof aiSuggestions.senderEmail === "string") {
      setSenderEmail(aiSuggestions.senderEmail);
    }
  }, [aiSuggestions]);

  // Sync `senderEmail` when the parent rewrites `value` externally (AI suggestion,
  // form.reset). Guard with lastSyncedEmailRef so poll-tick reference churn (same
  // content, new object spread) does not reset a user-typed address.
  useEffect(() => {
    const v = value as { senderEmail?: string } | null | undefined;
    const incoming = v?.senderEmail ?? "";
    if (typeof v?.senderEmail === "string" && incoming !== lastSyncedEmailRef.current) {
      lastSyncedEmailRef.current = incoming;
      setSenderEmail(incoming);
    }
  }, [value]);

  if (!campaignId) {
    return (
      <p className="text-sm text-muted-foreground">
        No campaign selected yet. Complete the previous setup steps first.
      </p>
    );
  }

  // Sender picker activation — the host gmail-sender condition
  // (makeGmailSenderCondition) gates on a connected gmail + present aliases, then
  // matches this `senderEmail` field via the x-renderer/whitelist heuristic. For
  // this specific shell-embedded field the predicate reduces to exactly that
  // context gate, replicated here (the host registry is not importable from a
  // pack). Connected -> the pack Select; otherwise -> the eager inline input.
  const gmailReady =
    context.connectedApps.includes("gmail") && (context.gmailAliases?.length ?? 0) > 0;
  const senderSchema: Record<string, unknown> = {
    type: "string",
    title: "Sender email",
    "x-renderer": "gmail-sender",
  };

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
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Recipients</span>
            <span>{recipientCount ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Drafts</span>
            <span>{draftCount ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Sender email — pack-composed (see the activation note above). Connected:
          the gmail-sender Select (hideSubmit suppresses any degrade-floor button).
          Disconnected: the eager inline input that commits every keystroke. */}
      {gmailReady ? (
        <GmailSenderFieldRenderer
          fieldName="senderEmail"
          schema={senderSchema}
          value={senderEmail}
          onChange={(v) => setSenderEmail(typeof v === "string" ? v : "")}
          disabled={disabled}
          required
          hideSubmit
          label="Sender email"
          context={context}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="field-senderEmail" className="text-foreground">
            Sender email *
          </Label>
          <Input
            id="field-senderEmail"
            type="email"
            className="border-line"
            value={senderEmail}
            disabled={disabled}
            placeholder="you@example.com"
            onChange={(e) => setSenderEmail(e.target.value)}
          />
        </div>
      )}

      {/* Warning */}
      <p className="text-sm text-destructive font-medium">
        Approving will send real emails to all recipients and cannot be undone.
      </p>
    </div>
  );
}

export default SendConfirmationRenderer;
