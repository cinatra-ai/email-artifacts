import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";
import { FollowUpCadenceFieldRenderer } from "../renderers/follow-up-cadence";

const baseProps = (over: Partial<FieldRendererProps> = {}): FieldRendererProps => ({
  fieldName: "cadence",
  schema: { type: "array" },
  value: undefined,
  onChange: vi.fn(),
  label: "Follow-up cadence",
  context: { connectedApps: [] },
  ...over,
});

afterEach(() => cleanup());

describe("FollowUpCadenceFieldRenderer (relocated to @cinatra-ai/email-artifacts)", () => {
  it("defaults to [4, 11, 25] when value is not an array", () => {
    render(<FollowUpCadenceFieldRenderer {...baseProps()} />);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(["4", "11", "25"]);
  });

  it("clamps entered days into the 1..30 range", () => {
    const onChange = vi.fn();
    render(<FollowUpCadenceFieldRenderer {...baseProps({ onChange, hideSubmit: true })} />);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: "99" } });
    expect(inputs[0].value).toBe("30");
    fireEvent.change(inputs[1], { target: { value: "0" } });
    expect(inputs[1].value).toBe("1");
  });

  it("pushes keystroke changes immediately when hideSubmit is true and hides Continue", () => {
    const onChange = vi.fn();
    render(<FollowUpCadenceFieldRenderer {...baseProps({ onChange, hideSubmit: true })} />);
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith([7, 11, 25]);
  });

  it("registers a flush callback that pushes the latest days", async () => {
    const onChange = vi.fn();
    let flush: (() => Promise<void>) | undefined;
    const registerFlush = (fn: () => Promise<void>) => { flush = fn; };
    render(<FollowUpCadenceFieldRenderer {...baseProps({ onChange, registerFlush })} />);
    expect(flush).toBeTypeOf("function");
    await flush!();
    expect(onChange).toHaveBeenCalledWith([4, 11, 25]);
  });

  it("submits via Continue when hideSubmit is false", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<FollowUpCadenceFieldRenderer {...baseProps({ onChange })} />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onChange).toHaveBeenCalledWith([4, 11, 25]);
  });
});
