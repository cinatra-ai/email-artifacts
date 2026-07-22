// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";
import {
  CampaignRecipientsReviewRenderer,
  extractRecipientsSnapshot,
  buildResumePayload,
} from "../renderers/campaign-recipients-review";

const bundle = {
  campaignId: "camp-1",
  sourceListName: "Q3 Prospects",
  confirmedRecipients: [
    {
      contactId: "c-1",
      name: "Ada Lovelace",
      title: "CTO",
      email: "ada@example.com",
      accountId: "a-1",
      accountName: "Analytical Engines",
    },
    {
      contactId: "c-2",
      name: "Alan Turing",
      title: "Head of Research",
      email: "alan@example.com",
      accountId: "a-2",
      accountName: "Bletchley Co",
    },
  ],
};

const baseProps = (over: Partial<FieldRendererProps> = {}): FieldRendererProps => ({
  fieldName: "recipients",
  schema: { type: "object" },
  value: bundle,
  onChange: vi.fn(),
  context: { connectedApps: [] },
  ...over,
});

// The gate's single string output picks up the serialized `userResponse` key.
const lastPayload = (onChange: ReturnType<typeof vi.fn>) => {
  const calls = onChange.mock.calls;
  const last = calls[calls.length - 1]?.[0] as { userResponse?: string } | undefined;
  return last?.userResponse ? JSON.parse(last.userResponse) : undefined;
};

afterEach(() => cleanup());

describe("extractRecipientsSnapshot", () => {
  it("reads the generate-node confirmedRecipients array and normalizes rows", () => {
    const rows = extractRecipientsSnapshot(bundle);
    expect(rows.map((r) => r.id)).toEqual(["c-1", "c-2"]);
    expect(rows[0]).toMatchObject({
      contactId: "c-1",
      accountId: "a-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      accountName: "Analytical Engines",
    });
  });

  it("reads the interrupt-payload `recipients` compat key + startupId/contactName aliases", () => {
    const rows = extractRecipientsSnapshot({
      recipients: [
        { startupId: "s-9", contactName: "Grace Hopper", contactEmail: "grace@example.com", startupName: "COBOL Inc" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "s-9", accountId: "s-9", name: "Grace Hopper", email: "grace@example.com" });
  });

  it("returns [] for a non-object / empty snapshot", () => {
    expect(extractRecipientsSnapshot(null)).toEqual([]);
    expect(extractRecipientsSnapshot({})).toEqual([]);
    expect(extractRecipientsSnapshot({ confirmedRecipients: [] })).toEqual([]);
  });
});

describe("buildResumePayload", () => {
  it("marks edited=false and emits an EMPTY removedRecipients batch when nothing is removed (non-destructive no-op)", () => {
    const rows = extractRecipientsSnapshot(bundle);
    const payload = buildResumePayload(rows, new Set(), "camp-1");
    expect(payload.edited).toBe(false);
    // The OPERATIVE field the seam/primitive consume — empty = keep every stored row.
    expect(payload.removedRecipients).toEqual([]);
    expect(payload.approvedRecipientIds).toEqual(["c-1", "c-2"]);
    expect(payload.campaignId).toBe("camp-1");
  });

  it("carries the REMOVED recipient rows (with match identity), not the kept set", () => {
    const rows = extractRecipientsSnapshot(bundle);
    const payload = buildResumePayload(rows, new Set(["c-2"]), "camp-1");
    expect(payload.edited).toBe(true);
    expect(payload.removedRecipients).toEqual([
      { id: "c-2", contactId: "c-2", accountId: "a-2", recipientEmail: "alan@example.com" },
    ]);
    // Informational kept set.
    expect(payload.approvedRecipientIds).toEqual(["c-1"]);
  });

  it("emits a valid EMPTY payload for a zero-recipient snapshot (codex #1960 finding 3)", () => {
    const payload = buildResumePayload([], new Set(), "camp-1");
    expect(payload.removedRecipients).toEqual([]);
    expect(payload.approvedRecipientIds).toEqual([]);
    expect(payload.edited).toBe(false);
  });
});

describe("CampaignRecipientsReviewRenderer", () => {
  it("renders one row per recipient + the source list and seeds the resume payload", () => {
    const onChange = vi.fn();
    render(<CampaignRecipientsReviewRenderer {...baseProps({ onChange })} />);
    expect(screen.getByText("2 recipients")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByText("Q3 Prospects")).toBeTruthy();
    const payload = lastPayload(onChange);
    expect(payload.approvedRecipientIds).toEqual(["c-1", "c-2"]);
    expect(payload.edited).toBe(false);
  });

  it("emits edited=true with the removed row (match identity) when the operator trashes a row", () => {
    const onChange = vi.fn();
    render(<CampaignRecipientsReviewRenderer {...baseProps({ onChange })} />);
    const removeButtons = screen.getAllByRole("button", { name: /remove recipient/i });
    fireEvent.click(removeButtons[0]);
    const payload = lastPayload(onChange);
    expect(payload.edited).toBe(true);
    expect(payload.removedRecipients).toEqual([
      { id: "c-1", contactId: "c-1", accountId: "a-1", recipientEmail: "ada@example.com" },
    ]);
    expect(payload.approvedRecipientIds).toEqual(["c-2"]);
    expect(screen.getByText("1 recipient")).toBeTruthy();
  });

  it("Undo restores a removed recipient (the add-back affordance over the snapshot)", () => {
    const onChange = vi.fn();
    render(<CampaignRecipientsReviewRenderer {...baseProps({ onChange })} />);
    fireEvent.click(screen.getAllByRole("button", { name: /remove recipient/i })[0]);
    expect(lastPayload(onChange).removedRecipients.map((r: { id: string }) => r.id)).toEqual(["c-1"]);
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    const payload = lastPayload(onChange);
    expect(payload.edited).toBe(false);
    expect(payload.removedRecipients).toEqual([]);
    expect(payload.approvedRecipientIds).toEqual(["c-1", "c-2"]);
  });

  it("shows the empty state but STILL emits a valid empty resume payload (codex #1960 finding 3 — zero-recipient runs must complete)", () => {
    const onChange = vi.fn();
    render(<CampaignRecipientsReviewRenderer {...baseProps({ value: {}, onChange })} />);
    expect(screen.getByText(/Waiting for the agent/)).toBeTruthy();
    const payload = lastPayload(onChange);
    expect(payload).toBeTruthy();
    expect(payload.removedRecipients).toEqual([]);
    expect(payload.approvedRecipientIds).toEqual([]);
    expect(payload.edited).toBe(false);
  });

  it("does not re-emit onChange when the parent re-renders with a content-equal but new value object (loop guard, cinatra#1959/#1960)", () => {
    const onChange = vi.fn();
    const onHitlContextChange = vi.fn();
    const { rerender } = render(
      <CampaignRecipientsReviewRenderer {...baseProps({ onChange, onHitlContextChange })} />,
    );
    const onChangeAfterMount = onChange.mock.calls.length;
    const onCtxAfterMount = onHitlContextChange.mock.calls.length;
    expect(onChangeAfterMount).toBeGreaterThan(0);
    expect(onCtxAfterMount).toBeGreaterThan(0);
    // Two content-equal re-renders with brand-new value objects (identity churn).
    rerender(
      <CampaignRecipientsReviewRenderer
        {...baseProps({ onChange, onHitlContextChange, value: JSON.parse(JSON.stringify(bundle)) })}
      />,
    );
    rerender(
      <CampaignRecipientsReviewRenderer
        {...baseProps({ onChange, onHitlContextChange, value: JSON.parse(JSON.stringify(bundle)) })}
      />,
    );
    expect(onChange.mock.calls.length).toBe(onChangeAfterMount);
    expect(onHitlContextChange.mock.calls.length).toBe(onCtxAfterMount);
  });
});
