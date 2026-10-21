// The test-only double of the host-shared design primitives
// (tests/doubles/design-primitives.tsx), pinned to the behaviour the renderer
// tests rely on: plain elements, the real roles, the props passed through,
// and no class strings of its own (it is not a copy of a product primitive).
//
// The double is imported by its path, not by the module id, so these
// assertions read the double even where the id resolves to the real module.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  Button,
  Checkbox,
  Field,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "../../tests/doubles/design-primitives";

afterEach(() => cleanup());

describe("test double of @cinatra-ai/design-primitives", () => {
  it("renders Button as a button that passes children and handlers, without a class of its own", () => {
    const onClick = vi.fn();
    render(
      <Button variant="outline" size="sm" asChild onClick={onClick}>
        Send
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Send" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("class")).toBeNull();
    expect(button.dataset.variant).toBe("outline");
    expect(button.dataset.size).toBe("sm");
    expect(button.hasAttribute("variant")).toBe(false);
    expect(button.hasAttribute("aschild")).toBe(false);
  });

  it("passes value, onChange and type through Input and InputGroupInput", () => {
    const onChange = vi.fn();
    render(
      <>
        <Input value="Hello there" onChange={onChange} />
        <InputGroupInput type="number" value="4" onChange={() => undefined} />
      </>,
    );
    const text = screen.getByDisplayValue("Hello there");
    fireEvent.change(text, { target: { value: "Hello again" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("4");
  });

  it("passes value through Textarea", () => {
    render(<Textarea value="Body text" onChange={() => undefined} />);
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
    expect(screen.getByDisplayValue("Body text")).toBeTruthy();
  });

  it("renders Checkbox with role checkbox and aria-checked, and reports the next state on click", () => {
    const onUnchecked = vi.fn();
    const onChecked = vi.fn();
    render(
      <>
        <Checkbox aria-label="first" checked={false} onCheckedChange={onUnchecked} />
        <Checkbox aria-label="second" checked onCheckedChange={onChecked} />
      </>,
    );
    const first = screen.getByRole("checkbox", { name: "first" });
    const second = screen.getByRole("checkbox", { name: "second" });
    expect(first.getAttribute("aria-checked")).toBe("false");
    expect(second.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(first);
    fireEvent.click(second);
    expect(onUnchecked).toHaveBeenCalledWith(true);
    expect(onChecked).toHaveBeenCalledWith(false);
  });

  it("does not report a change from a disabled Checkbox, and marks an indeterminate one as mixed", () => {
    const onCheckedChange = vi.fn();
    render(
      <>
        <Checkbox aria-label="off" disabled checked={false} onCheckedChange={onCheckedChange} />
        <Checkbox aria-label="some" checked="indeterminate" />
      </>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "off" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "some" }).getAttribute("aria-checked")).toBe("mixed");
  });

  it("renders the label text of Label and FieldLabel, and the children of Field, InputGroup and InputGroupAddon", () => {
    render(
      <Field>
        <Label htmlFor="a">Sender email</Label>
        <FieldLabel htmlFor="b">Draft subject</FieldLabel>
        <InputGroup>
          <InputGroupAddon align="inline-start">@</InputGroupAddon>
        </InputGroup>
      </Field>,
    );
    expect(screen.getByText("Sender email").tagName).toBe("LABEL");
    expect(screen.getByText("Draft subject").tagName).toBe("LABEL");
    expect(screen.getByText("@").tagName).toBe("DIV");
  });

  it("renders the SelectValue placeholder and the children of the select parts", () => {
    render(
      <Select value="a">
        <SelectTrigger>
          <SelectValue placeholder="Select a sender address" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">first@example.test</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox").textContent).toBe("Select a sender address");
    expect(screen.getByRole("option").textContent).toBe("first@example.test");
  });
});
