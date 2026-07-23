import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";
import { SendConfirmationRenderer } from "../renderers/send-confirmation";

const baseProps = (over: Partial<FieldRendererProps> = {}): FieldRendererProps => ({
  fieldName: "sendConfirmation",
  schema: { type: "object" },
  value: { campaignId: "camp-1", summary: { recipientCount: 12, draftCount: 12 } },
  onChange: vi.fn(),
  context: { connectedApps: [] },
  ...over,
});

afterEach(() => cleanup());

describe("SendConfirmationRenderer — snapshot summary (action-decoupled, cinatra#1961)", () => {
  it("renders the recipient/draft counts PURELY from the gate-supplied value.summary", () => {
    render(<SendConfirmationRenderer {...baseProps()} />);
    expect(screen.getByText("Campaign Summary")).toBeTruthy();
    expect(screen.getByText("camp-1")).toBeTruthy();
    // Both counts come from value.summary — no fetchCampaignRecipients/fetchInitialDrafts.
    expect(screen.getAllByText("12")).toHaveLength(2);
  });

  it("shows the em-dash never-blank floor when the snapshot omits the summary", () => {
    render(<SendConfirmationRenderer {...baseProps({ value: { campaignId: "camp-1" } })} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("renders the pre-setup message when no campaign is selected yet", () => {
    render(<SendConfirmationRenderer {...baseProps({ value: {} })} />);
    expect(screen.getByText(/No campaign selected yet/)).toBeTruthy();
  });

  it("always shows the irreversible-send warning", () => {
    render(<SendConfirmationRenderer {...baseProps()} />);
    expect(screen.getByText(/Approving will send real emails/)).toBeTruthy();
  });
});

// Sender is DISPLAY-ONLY (owner ruling 2026-07-23 (groganz), option (a);
// cinatra#1961 follow-up F2). The send always uses the campaign-configured sender
// (the email-delivery flow wires senderEmail to the send node from `start`, not
// from this gate), so the previously-editable sender field was a lie — its edit
// was emitted into the approval payload but never honored. The shell now renders
// the sender as plain read-only data with NO input affordance in EITHER gmail
// connectivity state (the old connected-Select / disconnected-inline-input fork
// is gone entirely).
describe("SendConfirmationRenderer — sender is display-only (owner ruling 2026-07-23)", () => {
  it("renders the sender address as plain read-only data — no input, no picker", () => {
    const { container } = render(
      <SendConfirmationRenderer {...baseProps({ value: { campaignId: "camp-1", senderEmail: "me@acme.com" } })} />,
    );
    // Shown under a plain "Sender" label as read-only text.
    expect(screen.getByText("Sender")).toBeTruthy();
    expect(screen.getByText("me@acme.com")).toBeTruthy();
    // No input affordance whatsoever — neither the eager inline input nor a picker.
    expect(container.querySelector("#field-senderEmail")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.queryByText("Select a sender address")).toBeNull();
  });

  it("renders NO editable sender even when gmail is CONNECTED with aliases", () => {
    const { container } = render(
      <SendConfirmationRenderer
        {...baseProps({
          value: { campaignId: "camp-1", senderEmail: "founder@acme.com" },
          context: {
            connectedApps: ["gmail"],
            gmailAliases: [{ sendAsEmail: "founder@acme.com", displayName: "Founder" }],
          },
        })}
      />,
    );
    // The read-only address shows; the old connected-state Select is gone.
    expect(screen.getByText("founder@acme.com")).toBeTruthy();
    expect(container.querySelector("input#field-senderEmail")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.queryByText("Select a sender address")).toBeNull();
  });
});

// cinatra#1961 — SELF-ERASURE REGRESSION. The renderer's mount effect re-emits
// the approval payload, and the run panel REPLACES `value` with exactly that
// emitted object. The gate surfaces `summary` only on the pre-interrupt visit, so
// before the fix the emit dropped it and the recipient/draft counts collapsed to
// em-dashes on the next controlled re-render. Both the latch and the emit-echo are
// exercised here.
describe("SendConfirmationRenderer — controlled re-render summary preservation (cinatra#1961)", () => {
  it("keeps the recipient/draft counts when the parent echoes the emitted payload back as value", () => {
    // Controlled parent: value starts with the gate-surfaced summary; every
    // onChange REPLACES value with exactly the emitted object (run-panel semantics).
    let current: Record<string, unknown> = {
      campaignId: "camp-1",
      summary: { recipientCount: 12, draftCount: 12 },
    };
    const onChange = vi.fn((next: unknown) => {
      current = next as Record<string, unknown>;
    });
    const { rerender } = render(
      <SendConfirmationRenderer {...baseProps({ value: current, onChange })} />,
    );
    // The mount effect emitted; feed the emitted object back as the new value.
    expect(onChange).toHaveBeenCalled();
    rerender(<SendConfirmationRenderer {...baseProps({ value: current, onChange })} />);
    // Counts SURVIVE — the pre-fix self-erasure collapsed both to em-dashes.
    expect(screen.getAllByText("12")).toHaveLength(2);
    expect(screen.queryByText("—")).toBeNull();
  });

  it("echoes the gate summary into the emitted approval payload (round-trip fidelity)", () => {
    const onChange = vi.fn();
    render(
      <SendConfirmationRenderer
        {...baseProps({
          onChange,
          value: { campaignId: "camp-1", summary: { recipientCount: 3, draftCount: 5 } },
        })}
      />,
    );
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.campaignId).toBe("camp-1");
    expect(last.summary).toEqual({ recipientCount: 3, draftCount: 5 });
  });
});

describe("SendConfirmationRenderer — scheduledAt row (surfaced snapshot field)", () => {
  it("renders a Scheduled row when the summary carries a scheduledAt", () => {
    render(
      <SendConfirmationRenderer
        {...baseProps({
          value: {
            campaignId: "camp-1",
            summary: { recipientCount: 2, draftCount: 2, scheduledAt: "2026-07-24T09:00:00Z" },
          },
        })}
      />,
    );
    expect(screen.getByText("Scheduled")).toBeTruthy();
    expect(screen.getByText("2026-07-24T09:00:00Z")).toBeTruthy();
  });

  it("omits the Scheduled row for an immediate send (no scheduledAt)", () => {
    render(<SendConfirmationRenderer {...baseProps()} />);
    expect(screen.queryByText("Scheduled")).toBeNull();
  });
});

describe("SendConfirmationRenderer — approval payload", () => {
  it("emits { campaignId } only — never senderEmail, even when the gate surfaced one (send uses the campaign-configured sender)", () => {
    const onChange = vi.fn();
    render(
      <SendConfirmationRenderer
        {...baseProps({ onChange, value: { campaignId: "camp-9", senderEmail: "me@acme.com" } })}
      />,
    );
    // The emit carries ONLY the campaignId (no summary here) and MUST NOT carry
    // senderEmail — the editable-sender emit was the defect the owner ruling fixed.
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last).toEqual({ campaignId: "camp-9" });
    expect(last).not.toHaveProperty("senderEmail");
  });

  it("does not emit while no campaign is selected", () => {
    const onChange = vi.fn();
    render(<SendConfirmationRenderer {...baseProps({ onChange, value: {} })} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});

// The read-only sender row carries the exact sender the send will use, surfaced by
// the gate for DISPLAY (surfaceGateInputs) and latched so it survives the emit
// round-trip that intentionally drops it (display-only — owner ruling 2026-07-23).
describe("SendConfirmationRenderer — senderEmail read-only display (latched)", () => {
  it("reflects value.senderEmail as read-only text and updates on external change (a@x.com -> b@x.com)", () => {
    const { rerender, container } = render(
      <SendConfirmationRenderer {...baseProps({ value: { campaignId: "c1", senderEmail: "a@x.com" } })} />,
    );
    expect(screen.getByText("a@x.com")).toBeTruthy();
    // Read-only: it is TEXT, not a form control.
    expect(container.querySelector("#field-senderEmail")).toBeNull();
    rerender(
      <SendConfirmationRenderer {...baseProps({ value: { campaignId: "c1", senderEmail: "b@x.com" } })} />,
    );
    expect(screen.getByText("b@x.com")).toBeTruthy();
  });

  it("reseeds on a campaign switch — the prior campaign's sender never leaks", () => {
    const { rerender } = render(
      <SendConfirmationRenderer {...baseProps({ value: { campaignId: "c1", senderEmail: "a@x.com" } })} />,
    );
    expect(screen.getByText("a@x.com")).toBeTruthy();
    // A different campaign with its own sender — the latch must reset, not carry a@x.com.
    rerender(
      <SendConfirmationRenderer {...baseProps({ value: { campaignId: "c2", senderEmail: "c@x.com" } })} />,
    );
    expect(screen.getByText("c@x.com")).toBeTruthy();
    expect(screen.queryByText("a@x.com")).toBeNull();
    // Switching to a campaign that surfaced NO sender drops the row entirely.
    rerender(<SendConfirmationRenderer {...baseProps({ value: { campaignId: "c3" } })} />);
    expect(screen.queryByText("Sender")).toBeNull();
    expect(screen.queryByText("c@x.com")).toBeNull();
  });

  it("keeps the sender displayed after the self-erasing emit round-trip (display-only latch)", () => {
    // Controlled parent that REPLACES value with each emitted object (run-panel
    // semantics). The emit drops senderEmail (display-only), so without the latch
    // the row would collapse to blank on the echoed re-render.
    let current: Record<string, unknown> = {
      campaignId: "camp-1",
      senderEmail: "founder@acme.com",
      summary: { recipientCount: 2, draftCount: 2 },
    };
    const onChange = vi.fn((next: unknown) => {
      current = next as Record<string, unknown>;
    });
    const { rerender } = render(
      <SendConfirmationRenderer {...baseProps({ value: current, onChange })} />,
    );
    expect(screen.getByText("founder@acme.com")).toBeTruthy();
    expect(onChange).toHaveBeenCalled();
    // The echoed-back payload carried NO senderEmail (display-only emit) ...
    expect(current).not.toHaveProperty("senderEmail");
    rerender(<SendConfirmationRenderer {...baseProps({ value: current, onChange })} />);
    // ... yet the read-only sender SURVIVES via the latch.
    expect(screen.getByText("founder@acme.com")).toBeTruthy();
  });
});
