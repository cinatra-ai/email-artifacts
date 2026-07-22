"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";

// Pure snapshot -> onChange renderer for the RE-ENTRANT drafts / follow-ups
// review gate (cinatra#1959). Relocated out of the core host renderer
// (packages/agents/src/email-drafts-review-renderer.tsx) into this pack under
// the owner action-boundary ruling (2026-07-18, epic #1620): the renderer no
// longer reaches an authenticated host action.
//
// It reads the AUTHORIZED draft snapshot the agent's draft node surfaced INTO
// the gate input payload (A-i: `surfaceGateInputs: true` merges the gate's
// declared `draftBundle` / `followupBundle` input into `value`), and it emits
// the per-recipient edits into the gate's single string output `userResponse`
// (A-ii: the post-resume apply ApiNode parses that and persists via the
// run-scoped `email_outreach_initial_drafts_update` primitive). There is NO
// `fetchInitialDrafts` mount read and NO per-draft server Save — every edit
// lives in the resume payload and is persisted once on approval.
//
// ONE component serves BOTH agent-namespaced binding ids
// (@cinatra-ai/email-drafting-agent:email-drafts-review and
// @cinatra-ai/email-follow-up-agent:email-drafts-review); the bundle key
// (`draftBundle` vs `followupBundle`) is the only shape difference and both are
// probed below.

type SnapshotDraft = {
  id?: string;
  recipientId?: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  subject?: string;
  body?: string;
  followUpDay?: number;
};

type NormalizedDraft = {
  id: string;
  recipientId: string;
  recipientName: string | null;
  recipientEmail: string | null;
  subject: string;
  body: string;
  followUpDay?: number;
};

// Resume-payload draft row — the shape the apply node's shaper forwards to the
// core persist primitive (a superset of the legacy reviewer output so the
// primitive persists without a re-read).
type ResumeDraft = {
  id: string;
  recipientId: string;
  recipientEmail: string | null;
  subject: string;
  body: string;
  status: "draft";
  followUpDay?: number;
};

type ResumePayload = {
  campaignId?: string;
  approvedDraftIds: string[];
  edited: boolean;
  editedIds: string[];
  drafts: ResumeDraft[];
};

/**
 * Normalize the gate-surfaced snapshot into stable per-recipient rows. Probes
 * `value.draftBundle` (initial) then `value.followupBundle` (follow-up), then
 * `value` itself, and inside that the canonical `draftedEmails` array (with
 * `drafts` / `emails` compat fallbacks). Pure — no fetch, no id minting beyond
 * a deterministic index fallback so a snapshot missing ids still renders.
 */
export function extractDraftSnapshot(value: unknown): NormalizedDraft[] {
  if (!value || typeof value !== "object") return [];
  const v = value as Record<string, unknown>;
  const bundleCandidate =
    (v.draftBundle as Record<string, unknown> | undefined) ??
    (v.followupBundle as Record<string, unknown> | undefined) ??
    v;
  const bundle =
    bundleCandidate && typeof bundleCandidate === "object"
      ? (bundleCandidate as Record<string, unknown>)
      : {};
  const rawArray = bundle.draftedEmails ?? bundle.drafts ?? bundle.emails;
  const items = Array.isArray(rawArray) ? (rawArray as SnapshotDraft[]) : [];
  return items.map((d, i): NormalizedDraft => ({
    id: String(d.id ?? d.recipientId ?? d.recipientEmail ?? `draft-${i}`),
    recipientId: String(d.recipientId ?? d.id ?? d.recipientEmail ?? `recipient-${i}`),
    recipientName: (d.recipientName ?? null) as string | null,
    recipientEmail: (d.recipientEmail ?? null) as string | null,
    subject: String(d.subject ?? ""),
    body: String(d.body ?? ""),
    ...(typeof d.followUpDay === "number" ? { followUpDay: d.followUpDay } : {}),
  }));
}

function resolveCampaignId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const direct = v.campaignId;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const bundle =
    (v.draftBundle as Record<string, unknown> | undefined) ??
    (v.followupBundle as Record<string, unknown> | undefined);
  const fromBundle = bundle?.campaignId;
  return typeof fromBundle === "string" && fromBundle.length > 0 ? fromBundle : undefined;
}

/**
 * Build the resume payload from the current snapshot + edits. Exported for the
 * pack test so the serialized contract the apply node consumes is pinned.
 */
export function buildResumePayload(
  drafts: NormalizedDraft[],
  edits: Record<string, { subject: string; body: string }>,
  campaignId: string | undefined,
): ResumePayload {
  const editedIds = drafts
    .filter((d) => {
      const e = edits[d.id];
      if (!e) return false;
      return e.subject !== d.subject || e.body !== d.body;
    })
    .map((d) => d.id);
  return {
    ...(campaignId ? { campaignId } : {}),
    approvedDraftIds: drafts.map((d) => d.id),
    edited: editedIds.length > 0,
    editedIds,
    drafts: drafts.map((d): ResumeDraft => ({
      id: d.id,
      recipientId: d.recipientId,
      recipientEmail: d.recipientEmail,
      subject: edits[d.id]?.subject ?? d.subject,
      body: edits[d.id]?.body ?? d.body,
      status: "draft",
      ...(typeof d.followUpDay === "number" ? { followUpDay: d.followUpDay } : {}),
    })),
  };
}

export function EmailDraftsReviewRenderer({
  value,
  onChange,
  disabled,
  aiSuggestions,
  onHitlContextChange,
}: FieldRendererProps) {
  const drafts = useMemo(() => extractDraftSnapshot(value), [value]);
  const campaignId = useMemo(() => resolveCampaignId(value), [value]);

  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});

  // Seed / re-seed edit state from the snapshot ONLY when its (id, subject,
  // body) fingerprint changes — an identity-only re-reference from a parent
  // re-render must not clobber in-progress typing.
  const lastFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    const fingerprint = JSON.stringify(
      drafts.map((d) => ({ id: d.id, subject: d.subject, body: d.body })),
    );
    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;
    const seeded: Record<string, { subject: string; body: string }> = {};
    for (const d of drafts) seeded[d.id] = { subject: d.subject, body: d.body };
    setEdits(seeded);
  }, [drafts]);

  // Sync local edits when an AI suggestion arrives from the parent's sticky
  // prompt. `aiSuggestions` only changes on Suggest-click (unlike `value`), so
  // this fires once per suggestion and never wipes in-progress user text.
  useEffect(() => {
    if (!aiSuggestions) return;
    const incoming = (aiSuggestions as { drafts?: Array<{ id?: string; subject?: string; body?: string }> })
      .drafts;
    if (!Array.isArray(incoming)) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const d of incoming) {
        if (d.id) {
          next[d.id] = {
            subject: d.subject ?? prev[d.id]?.subject ?? "",
            body: d.body ?? prev[d.id]?.body ?? "",
          };
        }
      }
      return next;
    });
  }, [aiSuggestions]);

  // Emit the resume payload on every content change so the parent's Approve
  // button captures the current edits. The gate's single string output
  // `userResponse` reads the serialized payload; the parent merges
  // `{ approved: true }` on top when the operator approves.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (drafts.length === 0) return;
    const payload = buildResumePayload(drafts, edits, campaignId);
    onChangeRef.current({ ...payload, userResponse: JSON.stringify(payload) });
  }, [drafts, edits, campaignId]);

  // Publish effective content so the hitl-assist LLM sees current text.
  useEffect(() => {
    if (drafts.length === 0) return;
    onHitlContextChange?.({
      drafts: drafts.map((d) => ({
        id: d.id,
        recipientEmail: d.recipientEmail,
        subject: edits[d.id]?.subject ?? d.subject,
        body: edits[d.id]?.body ?? d.body,
      })),
    });
  }, [drafts, edits, onHitlContextChange]);

  const handleFieldChange = (draftId: string, field: "subject" | "body", val: string) => {
    setEdits((prev) => ({
      ...prev,
      [draftId]: {
        subject: prev[draftId]?.subject ?? "",
        body: prev[draftId]?.body ?? "",
        [field]: val,
      },
    }));
  };

  const handleReset = (draftId: string, original: NormalizedDraft) => {
    setEdits((prev) => ({
      ...prev,
      [draftId]: { subject: original.subject, body: original.body },
    }));
  };

  if (drafts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Waiting for the agent to generate email drafts…
      </p>
    );
  }

  return (
    <div className="soft-panel flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          Review drafts ({drafts.length})
        </span>
      </div>

      {drafts.map((draft) => {
        const edit = edits[draft.id] ?? { subject: draft.subject, body: draft.body };
        const isEdited = edit.subject !== draft.subject || edit.body !== draft.body;
        return (
          <div key={draft.id} className="soft-panel flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {draft.recipientEmail ?? draft.recipientName ?? "Unknown recipient"}
              </span>
              {typeof draft.followUpDay === "number" ? (
                <span className="text-xs text-muted-foreground shrink-0">
                  Day {draft.followUpDay}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-foreground">Subject</Label>
              <Input
                value={edit.subject}
                onChange={(e) => handleFieldChange(draft.id, "subject", e.target.value)}
                disabled={disabled}
                className="border-line"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-foreground">Body</Label>
              <Textarea
                value={edit.body}
                onChange={(e) => handleFieldChange(draft.id, "body", e.target.value)}
                disabled={disabled}
                rows={6}
                className="border-line"
              />
            </div>

            {isEdited ? (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleReset(draft.id, draft)}
                  disabled={disabled}
                >
                  Reset
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default EmailDraftsReviewRenderer;
