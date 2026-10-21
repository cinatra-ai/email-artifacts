// TEST-ONLY local double of the HOST-SHARED design primitives module
// (`@cinatra-ai/design-primitives`).
//
// The module id is VIRTUAL: the host-shared primitives contract
// (docs/internals/contracts/host-shared-primitives-contract.md in the cinatra
// repository) fixes it as host-neutral, and no package is published under it.
// Inside the host the id resolves through the host's own `compilerOptions.paths`
// onto `src/lib/artifacts/host-shared-primitives.ts` (the contract's BUILD-TIME
// road). A vitest run has no such mapping, so this package's vitest.config.ts
// aliases the id here (`resolvableOrStub`), and only while the id does not
// resolve: where it IS resolvable the real module is used and this file is inert.
//
// DELIBERATELY NOT A COPY of the product primitives. It carries no variant
// table, no class strings and no `cn` call: copying those back would
// reintroduce, under another name, the byte copies this package dropped. It
// implements ONLY the fifteen frozen-list names the renderers of this package
// import, as plain elements with `data-slot` hooks and the real roles the
// renderer tests reach for (button, textbox, checkbox, label text, the select
// placeholder).
//
// It lives OUTSIDE src/ so it can never be mistaken for package source, and
// outside the package's published `files` set.

import * as React from "react";

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: string;
  size?: string;
  asChild?: boolean;
};

export function Button({ variant, size, asChild: _asChild, ...props }: ButtonProps) {
  return <button data-slot="button" data-variant={variant} data-size={size} {...props} />;
}

export function Input(props: React.ComponentProps<"input">) {
  return <input data-slot="input" {...props} />;
}

export function Textarea(props: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" {...props} />;
}

export function Label(props: React.ComponentProps<"label">) {
  return <label data-slot="label" {...props} />;
}

type CheckboxProps = Omit<React.ComponentProps<"button">, "value" | "onChange"> & {
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  value?: string;
};

export function Checkbox({
  checked,
  defaultChecked: _defaultChecked,
  onCheckedChange,
  value,
  name,
  onClick,
  ...props
}: CheckboxProps) {
  const isChecked = checked === true;
  return (
    <button
      type="button"
      role="checkbox"
      data-slot="checkbox"
      aria-checked={checked === "indeterminate" ? "mixed" : isChecked}
      data-name={name}
      data-value={value}
      onClick={(event) => {
        onClick?.(event);
        if (!props.disabled) onCheckedChange?.(!isChecked);
      }}
      {...props}
    />
  );
}

export function Field(props: React.ComponentProps<"div">) {
  return <div data-slot="field" {...props} />;
}

export function FieldLabel(props: React.ComponentProps<"label">) {
  return <label data-slot="field-label" {...props} />;
}

export function InputGroup(props: React.ComponentProps<"div">) {
  return <div data-slot="input-group" {...props} />;
}

type InputGroupAddonProps = React.ComponentProps<"div"> & { align?: string };

export function InputGroupAddon({ align, ...props }: InputGroupAddonProps) {
  return <div data-slot="input-group-addon" data-align={align} {...props} />;
}

export function InputGroupInput(props: React.ComponentProps<"input">) {
  return <input data-slot="input-group-control" {...props} />;
}

type SelectProps = {
  children?: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
  required?: boolean;
};

export function Select({ children, value, disabled }: SelectProps) {
  return (
    <div data-slot="select" data-value={value} data-disabled={disabled ? "" : undefined}>
      {children}
    </div>
  );
}

type SelectTriggerProps = React.ComponentProps<"button"> & { size?: string };

export function SelectTrigger({ size, children, ...props }: SelectTriggerProps) {
  return (
    <button type="button" role="combobox" data-slot="select-trigger" data-size={size} {...props}>
      {children}
    </button>
  );
}

type SelectValueProps = { placeholder?: React.ReactNode; className?: string };

export function SelectValue({ placeholder, className }: SelectValueProps) {
  return (
    <span data-slot="select-value" className={className}>
      {placeholder}
    </span>
  );
}

type SelectContentProps = React.ComponentProps<"div"> & { position?: string; align?: string };

export function SelectContent({ position: _position, align: _align, ...props }: SelectContentProps) {
  return <div data-slot="select-content" {...props} />;
}

type SelectItemProps = React.ComponentProps<"div"> & { value: string; disabled?: boolean };

export function SelectItem({ value, disabled, ...props }: SelectItemProps) {
  return (
    <div
      role="option"
      aria-selected={false}
      aria-disabled={disabled || undefined}
      data-slot="select-item"
      data-value={value}
      {...props}
    />
  );
}
