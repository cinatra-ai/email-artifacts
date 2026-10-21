// Types for the HOST-SHARED design primitives module
// (`@cinatra-ai/design-primitives`).
//
// WHY THIS FILE EXISTS. The module id is VIRTUAL: the host-shared primitives
// contract publishes no package under it, and the contract module is React-free
// by design, so its typed surface names the exports, not their component types.
// A migrating package types the values it consumes against its own React types.
// This file does that for the fifteen names the renderers of this package
// import, for a standalone `tsc` of this package only.
//
// WHY IT LIVES UNDER `src/__tests__/fixtures/` AND NOWHERE ELSE. An ambient
// `declare module` wins over a tsconfig `paths` mapping for every file of the
// program that reads it. Inside the host this file must therefore never be part
// of the program, or it would shadow the host's REAL module
// (`src/lib/artifacts/host-shared-primitives.ts`, which serves the whole frozen
// export list). The host's tsconfig excludes `**/__tests__/fixtures/**`, and the
// extension tree is materialised at `extensions/cinatra-ai/email-artifacts/`, so
// this path is inside this package's own include (`src/**/*.ts`) and outside the
// host's program. It is also outside the published `files` set
// (`!src/__tests__`). src/__tests__/no-product-primitive-copies.test.ts pins the
// placement.
//
// WHAT THIS FILE IS NOT: not a copy of a product primitive (no implementation,
// no variant table, no class strings), not a dependency on the virtual id (a
// type-only ambient declaration adds no specifier to package.json), and not a
// tsconfig `paths` entry.
//
// This file is a global script (no top-level import/export) on purpose: a
// top-level import would make it a module, and `declare module` would then be
// read as an augmentation of a module that does not resolve. React types are
// reached through inline `import("react")` types instead.

declare module "@cinatra-ai/design-primitives" {
  type El = import("react").ReactElement | null;
  type Props<T extends keyof import("react").JSX.IntrinsicElements> =
    import("react").ComponentProps<T>;

  export const Button: (
    props: Props<"button"> & { variant?: string; size?: string; asChild?: boolean },
  ) => El;
  export const Input: (props: Props<"input">) => El;
  export const Textarea: (props: Props<"textarea">) => El;
  export const Label: (props: Props<"label">) => El;
  export const Checkbox: (
    props: Omit<Props<"button">, "value" | "onChange"> & {
      checked?: boolean | "indeterminate";
      defaultChecked?: boolean;
      onCheckedChange?: (checked: boolean | "indeterminate") => void;
      value?: string;
    },
  ) => El;
  export const Field: (props: Props<"div">) => El;
  export const FieldLabel: (props: Props<"label">) => El;
  export const InputGroup: (props: Props<"div">) => El;
  export const InputGroupAddon: (props: Props<"div"> & { align?: string }) => El;
  export const InputGroupInput: (props: Props<"input">) => El;
  export const Select: (props: {
    children?: import("react").ReactNode;
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    name?: string;
    required?: boolean;
  }) => El;
  export const SelectTrigger: (props: Props<"button"> & { size?: string }) => El;
  export const SelectValue: (props: {
    placeholder?: import("react").ReactNode;
    className?: string;
  }) => El;
  export const SelectContent: (
    props: Props<"div"> & { position?: string; align?: string },
  ) => El;
  export const SelectItem: (
    props: Props<"div"> & { value: string; disabled?: boolean },
  ) => El;
}
