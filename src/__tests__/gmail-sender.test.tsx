import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type {
  FieldRendererProps,
  GmailSendAsAliasOption,
} from "@cinatra-ai/sdk-ui/field-renderer-props";
import { GmailSenderFieldRenderer } from "../renderers/gmail-sender";

const aliases: GmailSendAsAliasOption[] = [
  { sendAsEmail: "sales@acme.test", displayName: "Acme Sales" },
  { sendAsEmail: "founder@acme.test" },
];

const baseProps = (over: Partial<FieldRendererProps> = {}): FieldRendererProps => ({
  fieldName: "senderEmail",
  schema: { type: "string", "x-renderer": "gmail-sender" },
  value: "",
  onChange: vi.fn(),
  label: "Sender email",
  context: { connectedApps: ["gmail"], gmailAliases: aliases },
  ...over,
});

afterEach(() => cleanup());

describe("GmailSenderFieldRenderer (component-only relocation to @cinatra-ai/email-artifacts)", () => {
  it("renders the label with a required marker", () => {
    render(<GmailSenderFieldRenderer {...baseProps({ required: true })} />);
    expect(screen.getByText(/Sender email/)).toBeTruthy();
  });

  it("renders a placeholder when no value is selected", () => {
    render(<GmailSenderFieldRenderer {...baseProps()} />);
    expect(screen.getByText("Select a sender address")).toBeTruthy();
  });

  it("tolerates an absent gmailAliases context without throwing", () => {
    expect(() =>
      render(
        <GmailSenderFieldRenderer
          {...baseProps({ context: { connectedApps: ["gmail"] } })}
        />,
      ),
    ).not.toThrow();
  });

  it("surfaces a caller-supplied error", () => {
    render(<GmailSenderFieldRenderer {...baseProps({ error: "Pick a sender" })} />);
    expect(screen.getByText("Pick a sender")).toBeTruthy();
  });
});
