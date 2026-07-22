import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";
import {
  EmailDraftsReviewRenderer,
  extractDraftSnapshot,
  buildResumePayload,
} from "../renderers/email-drafts-review";

const draftBundle = {
  draftBundle: {
    summary: "2 drafts ready",
    campaignId: "camp-1",
    draftedEmails: [
      {
        recipientId: "r-1",
        recipientName: "Ada",
        recipientEmail: "ada@example.com",
        subject: "Hello Ada",
        body: "Original body 1",
      },
      {
        recipientId: "r-2",
        recipientName: "Bob",
        recipientEmail: "bob@example.com",
        subject: "Hello Bob",
        body: "Original body 2",
      },
    ],
  },
};

const followupBundle = {
  followupBundle: {
    summary: "1 follow-up",
    draftedEmails: [
      {
        recipientId: "r-9",
        recipientEmail: "cara@example.com",
        subject: "Following up",
        body: "Nudge",
        followUpDay: 4,
      },
    ],
  },
};

const baseProps = (over: Partial<FieldRendererProps> = {}): FieldRendererProps => ({
  fieldName: "drafts",
  schema: { type: "object" },
  value: draftBundle,
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

describe("extractDraftSnapshot", () => {
  it("reads the initial draftBundle.draftedEmails array", () => {
    const rows = extractDraftSnapshot(draftBundle);
    expect(rows.map((r) => r.id)).toEqual(["r-1", "r-2"]);
    expect(rows[0]).toMatchObject({ recipientEmail: "ada@example.com", subject: "Hello Ada" });
  });

  it("reads the follow-up followupBundle and preserves followUpDay", () => {
    const rows = extractDraftSnapshot(followupBundle);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "r-9", followUpDay: 4 });
  });

  it("returns [] for a non-object / empty snapshot", () => {
    expect(extractDraftSnapshot(null)).toEqual([]);
    expect(extractDraftSnapshot({})).toEqual([]);
    expect(extractDraftSnapshot({ draftBundle: {} })).toEqual([]);
  });
});

describe("buildResumePayload", () => {
  it("marks edited=false and lists every id in approvedDraftIds when nothing changed", () => {
    const rows = extractDraftSnapshot(draftBundle);
    const edits = Object.fromEntries(rows.map((r) => [r.id, { subject: r.subject, body: r.body }]));
    const payload = buildResumePayload(rows, edits, "camp-1");
    expect(payload.edited).toBe(false);
    expect(payload.editedIds).toEqual([]);
    expect(payload.approvedDraftIds).toEqual(["r-1", "r-2"]);
    expect(payload.campaignId).toBe("camp-1");
    expect(payload.drafts[0]).toMatchObject({ id: "r-1", status: "draft", subject: "Hello Ada" });
  });

  it("flags an edited draft and carries the new content", () => {
    const rows = extractDraftSnapshot(draftBundle);
    const edits = Object.fromEntries(rows.map((r) => [r.id, { subject: r.subject, body: r.body }]));
    edits["r-2"] = { subject: "Edited subject", body: "Edited body" };
    const payload = buildResumePayload(rows, edits, "camp-1");
    expect(payload.edited).toBe(true);
    expect(payload.editedIds).toEqual(["r-2"]);
    const edited = payload.drafts.find((d) => d.id === "r-2");
    expect(edited).toMatchObject({ subject: "Edited subject", body: "Edited body" });
  });
});

describe("EmailDraftsReviewRenderer", () => {
  it("renders one card per draft with the recipient and seeds the resume payload", () => {
    const onChange = vi.fn();
    render(<EmailDraftsReviewRenderer {...baseProps({ onChange })} />);
    expect(screen.getByText("Review drafts (2)")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    const payload = lastPayload(onChange);
    expect(payload.approvedDraftIds).toEqual(["r-1", "r-2"]);
    expect(payload.edited).toBe(false);
  });

  it("emits edited=true with the new subject when the operator types", () => {
    const onChange = vi.fn();
    render(<EmailDraftsReviewRenderer {...baseProps({ onChange })} />);
    const subjectInputs = screen.getAllByDisplayValue(/Hello /) as HTMLInputElement[];
    fireEvent.change(subjectInputs[0], { target: { value: "Rewritten subject" } });
    const payload = lastPayload(onChange);
    expect(payload.edited).toBe(true);
    expect(payload.editedIds).toEqual(["r-1"]);
    expect(payload.drafts.find((d: { id: string }) => d.id === "r-1").subject).toBe(
      "Rewritten subject",
    );
  });

  it("shows the empty state and emits nothing when the snapshot has no drafts", () => {
    const onChange = vi.fn();
    render(<EmailDraftsReviewRenderer {...baseProps({ value: {}, onChange })} />);
    expect(screen.getByText(/Waiting for the agent/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders the follow-up day badge for a followupBundle", () => {
    render(<EmailDraftsReviewRenderer {...baseProps({ value: followupBundle })} />);
    expect(screen.getByText("Day 4")).toBeTruthy();
  });

  it("does not re-emit onChange when the parent re-renders with a content-equal but new value object (loop guard, cinatra#1959)", () => {
    // The run panel passes value={{ ...interruptContext.values, ...bufferedHitlValue }}
    // — a fresh object literal on every render — so `drafts` (useMemo over value)
    // churns identity each render. An unguarded emit effect would call onChange
    // every render → the panel's mid-run onChange (setBufferedHitlValue) →
    // re-render → infinite loop ("Maximum update depth exceeded"). The serialized
    // dedupe guard must suppress the redundant emit.
    const onChange = vi.fn();
    // onHitlContextChange is a stable parent callback (setRendererHitlContext);
    // an unguarded publish effect loops the same way as the emit effect, so both
    // must be deduped.
    const onHitlContextChange = vi.fn();
    const { rerender } = render(
      <EmailDraftsReviewRenderer {...baseProps({ onChange, onHitlContextChange })} />,
    );
    const onChangeAfterMount = onChange.mock.calls.length;
    const onCtxAfterMount = onHitlContextChange.mock.calls.length;
    expect(onChangeAfterMount).toBeGreaterThan(0);
    expect(onCtxAfterMount).toBeGreaterThan(0);
    // Two content-equal re-renders with brand-new value objects (identity churn).
    rerender(
      <EmailDraftsReviewRenderer
        {...baseProps({ onChange, onHitlContextChange, value: JSON.parse(JSON.stringify(draftBundle)) })}
      />,
    );
    rerender(
      <EmailDraftsReviewRenderer
        {...baseProps({ onChange, onHitlContextChange, value: JSON.parse(JSON.stringify(draftBundle)) })}
      />,
    );
    // No additional emit / publish — the content is unchanged.
    expect(onChange.mock.calls.length).toBe(onChangeAfterMount);
    expect(onHitlContextChange.mock.calls.length).toBe(onCtxAfterMount);
  });
});
