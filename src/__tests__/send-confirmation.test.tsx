import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

describe("SendConfirmationRenderer — embedded sender field (#1923 floor contract)", () => {
  it("gmail DISCONNECTED renders the eager inline #field-senderEmail input (never blank)", () => {
    const { container } = render(<SendConfirmationRenderer {...baseProps()} />);
    const input = container.querySelector("#field-senderEmail") as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input!.getAttribute("type")).toBe("email");
    // The pack Select trigger placeholder must NOT be present in the disconnected state.
    expect(screen.queryByText("Select a sender address")).toBeNull();
  });

  it("gmail CONNECTED (aliases present) renders the pack gmail-sender Select, not the inline input", () => {
    const { container } = render(
      <SendConfirmationRenderer
        {...baseProps({
          context: {
            connectedApps: ["gmail"],
            gmailAliases: [{ sendAsEmail: "founder@acme.com", displayName: "Founder" }],
          },
        })}
      />,
    );
    expect(screen.getByText("Select a sender address")).toBeTruthy();
    // The eager fallback is specifically an <input>; the gmail-sender Select
    // trigger also carries id="field-senderEmail" (a <button>), so distinguish by
    // tag — the connected state must render NO inline input.
    expect(container.querySelector("input#field-senderEmail")).toBeNull();
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
    const onChange = vi.fn((next: Record<string, unknown>) => {
      current = next;
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
  it("emits { campaignId, senderEmail } so the approval carries the confirmed sender", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SendConfirmationRenderer {...baseProps({ onChange, value: { campaignId: "camp-9" } })} />,
    );
    // Mount emit — campaignId present, sender not yet typed.
    expect(onChange).toHaveBeenCalledWith({ campaignId: "camp-9", senderEmail: undefined });
    const input = container.querySelector("#field-senderEmail") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "me@acme.com" } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last).toEqual({ campaignId: "camp-9", senderEmail: "me@acme.com" });
  });

  it("does not emit while no campaign is selected", () => {
    const onChange = vi.fn();
    render(<SendConfirmationRenderer {...baseProps({ onChange, value: {} })} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});

// Relocated from the retired host renderer-local-state Test 4 (cinatra#1961): the
// eager-inline sender value-sync + poll-safety fingerprint guard now live here.
describe("SendConfirmationRenderer — senderEmail value-sync (eager inline path)", () => {
  it("syncs senderEmail when value.senderEmail changes externally (a@x.com -> b@x.com)", () => {
    const { rerender } = render(
      <SendConfirmationRenderer {...baseProps({ value: { campaignId: "c1", senderEmail: "a@x.com" } })} />,
    );
    expect(screen.queryByDisplayValue("a@x.com")).not.toBeNull();
    rerender(
      <SendConfirmationRenderer {...baseProps({ value: { campaignId: "c1", senderEmail: "b@x.com" } })} />,
    );
    expect(screen.queryByDisplayValue("b@x.com")).not.toBeNull();
  });

  it("POLL SAFETY: a same-content re-emit with a new object reference does not reset a user-typed address", () => {
    const { rerender, container } = render(
      <SendConfirmationRenderer {...baseProps({ value: { campaignId: "c1", senderEmail: "a@x.com" } })} />,
    );
    const input = container.querySelector("#field-senderEmail") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "user@typed.com" } });
    expect(screen.queryByDisplayValue("user@typed.com")).not.toBeNull();
    // Poll tick — parent re-emits the SAME senderEmail in a fresh object.
    rerender(
      <SendConfirmationRenderer {...baseProps({ value: { campaignId: "c1", senderEmail: "a@x.com" } })} />,
    );
    expect(screen.queryByDisplayValue("user@typed.com")).not.toBeNull();
    expect(screen.queryByDisplayValue("a@x.com")).toBeNull();
  });
});
