"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Trash2, Undo2, Redo2 } from "lucide-react";
import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";

// Pure snapshot -> onChange renderer for the RE-ENTRANT campaign-recipients
// review gate (cinatra#1960, S8 successor of #1625). Relocated out of the core
// host renderer (packages/agents/src/campaign-recipients-review-renderer.tsx)
// into this pack under the owner action-boundary ruling (2026-07-18, epic
// #1620): the renderer no longer reaches an authenticated host action
// (fetchCampaignRecipients / confirmCampaignRecipients /
// removeEmailOutreachRecipient(s) are gone).
//
// It reads the AUTHORIZED recipient snapshot the agent's `generate` node
// surfaced INTO the gate input payload (A-i: `surfaceGateInputs: true` merges
// the gate's declared `confirmedRecipients` input into `value` — the SAME
// pre-gate `@cinatra-ai/campaigns:recipients` bundle the generate node
// objects_save'd), lets the operator remove / restore recipients over that
// snapshot, and emits the reviewed (kept) recipient set into the gate's single
// string output `userResponse` (A-ii: the post-resume apply ApiNode parses that
// and persists via the run-scoped `email_outreach_recipients_update` primitive).
// There is NO mount fetch and NO per-recipient server clear — every edit lives
// in the resume payload and is persisted once on approval. Removal-only over the
// snapshot (with undo/redo = restore) faithfully mirrors the host original,
// which had no add-a-recipient affordance (adding a fresh recipient needs a
// candidate pool absent from the pure snapshot).

type SnapshotRecipient = {
  contactId?: string | null;
  recipientId?: string | null;
  startupId?: string | null;
  accountId?: string | null;
  name?: string | null;
  contactName?: string | null;
  title?: string | null;
  contactTitle?: string | null;
  email?: string | null;
  contactEmail?: string | null;
  accountName?: string | null;
  startupName?: string | null;
};

type NormalizedRecipient = {
  id: string;
  contactId: string | null;
  accountId: string | null;
  name: string | null;
  title: string | null;
  email: string | null;
  accountName: string | null;
};

// Resume-payload recipient row — the identity the apply node's shaper forwards
// to the core persist primitive so it can match the operator's EXPLICITLY
// REMOVED row onto the run's own stored bundle row (by contactId, then email,
// then accountId). EXPLICIT-REMOVAL, NON-DESTRUCTIVE contract (codex #1960
// round-1 findings 1+2): the payload carries the rows the operator REMOVED, not
// the kept set — the primitive removes ONLY those and keeps every other stored
// row, so an empty `removedRecipients` is a benign no-op (parity with the #1959
// drafts primitive's absent-edits) and a row the operator never saw is never
// deleted.
type ResumeRecipientRef = {
  id: string;
  contactId: string | null;
  accountId: string | null;
  recipientEmail: string | null;
};

type ResumePayload = {
  campaignId?: string;
  // Informational: the kept recipient ids (the reviewed result). The primitive
  // reads `removedRecipients`, never this.
  approvedRecipientIds: string[];
  // The OPERATIVE field the passthrough seam projects + the persist primitive
  // consumes: the operator's explicit removals (each carrying its match identity).
  removedRecipients: ResumeRecipientRef[];
  edited: boolean;
};

/**
 * Normalize the gate-surfaced snapshot into stable per-recipient rows. Probes
 * `value.confirmedRecipients` (the generate-node bundle key) then
 * `value.recipients` (the interrupt-payload compat key), then `value` itself if
 * it is directly an array. Pure — no fetch, no id minting beyond a deterministic
 * index fallback so a snapshot missing ids still renders. Exported for the pack
 * test.
 */
export function extractRecipientsSnapshot(value: unknown): NormalizedRecipient[] {
  if (!value || typeof value !== "object") return [];
  const v = value as Record<string, unknown>;
  const rawArray = Array.isArray(v.confirmedRecipients)
    ? v.confirmedRecipients
    : Array.isArray(v.recipients)
      ? v.recipients
      : Array.isArray(value)
        ? (value as unknown[])
        : undefined;
  const items = Array.isArray(rawArray) ? (rawArray as SnapshotRecipient[]) : [];
  return items.map((r, i): NormalizedRecipient => {
    const contactId =
      (typeof r.contactId === "string" && r.contactId.length > 0 ? r.contactId : null) ??
      (typeof r.recipientId === "string" && r.recipientId.length > 0 ? r.recipientId : null);
    const accountId =
      (typeof r.accountId === "string" && r.accountId.length > 0 ? r.accountId : null) ??
      (typeof r.startupId === "string" && r.startupId.length > 0 ? r.startupId : null);
    const email =
      (typeof r.email === "string" && r.email.length > 0 ? r.email : null) ??
      (typeof r.contactEmail === "string" && r.contactEmail.length > 0 ? r.contactEmail : null);
    return {
      // Stable identity for keying removals — contact id first (CRM-native),
      // then account id, then email, then a deterministic positional fallback.
      id: String(contactId ?? accountId ?? email ?? `recipient-${i}`),
      contactId,
      accountId,
      name: (r.name ?? r.contactName ?? null) as string | null,
      title: (r.title ?? r.contactTitle ?? null) as string | null,
      email,
      accountName: (r.accountName ?? r.startupName ?? null) as string | null,
    };
  });
}

function resolveCampaignId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const direct = v.campaignId;
  return typeof direct === "string" && direct.length > 0 ? direct : undefined;
}

/**
 * Bundle-level list provenance (surfaced when the recipient bundle was
 * materialized from a saved CRM list). Absent when provenance is unavailable.
 */
function resolveSourceListName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const name = v.sourceListName;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

/**
 * Build the resume payload from the current snapshot + the removed-id set. The
 * OPERATIVE field is `removedRecipients` — the rows the operator explicitly
 * removed, each carrying its match identity (contactId / accountId /
 * recipientEmail) so the primitive removes EXACTLY those stored rows and keeps
 * everything else (non-destructive; codex #1960 findings 1+2). Exported for the
 * pack test so the serialized contract the apply node consumes is pinned.
 */
export function buildResumePayload(
  recipients: NormalizedRecipient[],
  removedIds: Set<string>,
  campaignId: string | undefined,
): ResumePayload {
  const kept = recipients.filter((r) => !removedIds.has(r.id));
  const removed = recipients.filter((r) => removedIds.has(r.id));
  return {
    ...(campaignId ? { campaignId } : {}),
    approvedRecipientIds: kept.map((r) => r.id),
    removedRecipients: removed.map((r): ResumeRecipientRef => ({
      id: r.id,
      contactId: r.contactId,
      accountId: r.accountId,
      recipientEmail: r.email,
    })),
    edited: removed.length > 0,
  };
}

export function CampaignRecipientsReviewRenderer({
  value,
  onChange,
  disabled,
  mode = "edit",
  aiSuggestions,
  onHitlContextChange,
}: FieldRendererProps) {
  const recipients = useMemo(() => extractRecipientsSnapshot(value), [value]);
  const campaignId = useMemo(() => resolveCampaignId(value), [value]);
  const sourceListName = useMemo(() => resolveSourceListName(value), [value]);

  // Removal history over the snapshot. `removedStack` is the ordered set of
  // removed ids (kept set = snapshot minus these); `redoStack` supports redo.
  // Restoring (undo) is the "add back" affordance over the snapshot.
  const [removedStack, setRemovedStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const removedIds = useMemo(() => new Set(removedStack), [removedStack]);

  // Re-seed (clear) the removal history ONLY when the snapshot's id fingerprint
  // changes — an identity-only re-reference from a parent re-render must not wipe
  // in-progress removals (the run panel passes a fresh `value` object each
  // render: `{...interruptContext.values, ...bufferedHitlValue}`).
  const lastFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    const fingerprint = JSON.stringify(recipients.map((r) => r.id));
    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;
    setRemovedStack([]);
    setRedoStack([]);
  }, [recipients]);

  // Sync removals from an AI suggestion arriving from the parent's sticky prompt.
  // `aiSuggestions` only changes on Suggest-click (unlike `value`), so this fires
  // once per suggestion. The suggestion carries the recipients it wants KEPT; any
  // snapshot row not in it is treated as removed.
  useEffect(() => {
    if (!aiSuggestions) return;
    const incoming = (aiSuggestions as { recipients?: Array<{ id?: string; contactId?: string; accountId?: string; email?: string }> })
      .recipients;
    if (!Array.isArray(incoming)) return;
    const keepIds = new Set(
      incoming
        .map((r) => String(r.id ?? r.contactId ?? r.accountId ?? r.email ?? ""))
        .filter((s) => s.length > 0),
    );
    setRemovedStack(recipients.filter((r) => !keepIds.has(r.id)).map((r) => r.id));
    setRedoStack([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSuggestions]);

  // Emit the resume payload on every content change so the parent's Approve
  // button captures the current kept set. The gate's single string output
  // `userResponse` reads the serialized payload; the parent merges
  // `{ approved: true }` on top when the operator approves. Dedupe emits on the
  // SERIALIZED payload — `recipients`/`removedIds` are fresh objects each parent
  // render, so an unguarded emit drives the panel's mid-run onChange
  // (setBufferedHitlValue) -> re-render -> new value -> new recipients -> this
  // effect again -> an infinite render loop (the cinatra#1959 loop). Emitting
  // only when the payload CONTENT changes breaks the loop while forwarding every
  // real edit.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const lastEmittedRef = useRef<string | null>(null);
  useEffect(() => {
    // Emit even for an EMPTY snapshot (codex #1960 finding 3): a legitimate
    // zero-recipient run (contacts existed but were all stale/filtered, so
    // `generate` validly persisted `confirmedRecipients: []`) must still forward
    // a VALID resume payload — otherwise approval forwards fallback text and the
    // seam rejects it as non-JSON, stranding the run. The empty payload
    // (`removedRecipients: []`) is stable, so this deduped emit cannot loop. This
    // is a deliberate divergence from the #1959 drafts renderer (which returns on
    // an empty snapshot) — drafts never legitimately reach the gate with zero rows.
    const payload = buildResumePayload(recipients, removedIds, campaignId);
    const serialized = JSON.stringify(payload);
    if (serialized === lastEmittedRef.current) return;
    lastEmittedRef.current = serialized;
    onChangeRef.current({ ...payload, userResponse: serialized });
  }, [recipients, removedIds, campaignId]);

  // Publish the effective kept set so the hitl-assist LLM sees the current list
  // (not the empty interrupt payload) and can edit it. Same identity-churn guard
  // as the emit effect: onHitlContextChange is a stable parent callback, so an
  // unguarded publish loops the same way (cinatra#1959).
  const lastPublishedRef = useRef<string | null>(null);
  useEffect(() => {
    if (recipients.length === 0) return;
    const kept = recipients.filter((r) => !removedIds.has(r.id));
    const serialized = JSON.stringify(kept);
    if (serialized === lastPublishedRef.current) return;
    lastPublishedRef.current = serialized;
    onHitlContextChange?.({ recipients: kept });
  }, [recipients, removedIds, onHitlContextChange]);

  const handleRemove = (id: string) => {
    setRemovedStack((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setRedoStack([]);
  };
  const handleUndo = () => {
    setRemovedStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const restored = prev[prev.length - 1];
      setRedoStack((r) => [...r, restored]);
      return next;
    });
  };
  const handleRedo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const reRemoved = prev[prev.length - 1];
      setRemovedStack((s) => (s.includes(reRemoved) ? s : [...s, reRemoved]));
      return next;
    });
  };

  const visibleRecipients = useMemo(
    () => recipients.filter((r) => !removedIds.has(r.id)),
    [recipients, removedIds],
  );
  const canUndo = removedStack.length > 0;
  const canRedo = redoStack.length > 0;
  const editable = mode === "edit" && !disabled;

  if (recipients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Waiting for the agent to generate the recipient list…
      </p>
    );
  }

  return (
    <div className="soft-panel flex flex-col gap-4 p-4">
      <span className="text-sm font-medium text-foreground">
        {visibleRecipients.length > 0
          ? `${visibleRecipients.length} recipient${visibleRecipients.length !== 1 ? "s" : ""}`
          : "No recipients selected"}
      </span>

      {sourceListName ? (
        <p className="text-sm text-muted-foreground">
          Sourced from list{" "}
          <span className="font-medium text-foreground">{sourceListName}</span>
        </p>
      ) : null}

      {editable ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={handleUndo} disabled={!canUndo} aria-label="Undo">
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRedo} disabled={!canRedo} aria-label="Redo">
            <Redo2 className="h-4 w-4" />
            Redo
          </Button>
          {removedStack.length > 0 ? (
            <span className="ml-1 text-xs text-muted-foreground">
              · {removedStack.length} removed
            </span>
          ) : null}
        </div>
      ) : null}

      {visibleRecipients.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Contact</th>
                <th className="py-1 pr-3 font-medium">Title</th>
                <th className="py-1 pr-3 font-medium">Email</th>
                <th className="py-1 pr-3 font-medium">Company</th>
                {editable ? <th className="w-px" /> : null}
              </tr>
            </thead>
            <tbody>
              {visibleRecipients.map((r, i) => (
                <tr key={`${i}::${r.id}::${r.email ?? ""}`} className="border-t border-line">
                  <td className="py-2 pr-3 font-medium text-foreground">{r.name ?? "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.title ?? "—"}</td>
                  <td className="py-2 pr-3 text-foreground">{r.email ?? "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.accountName ?? r.accountId ?? "—"}</td>
                  {editable ? (
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(r.id)}
                        aria-label="Remove recipient"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default CampaignRecipientsReviewRenderer;
