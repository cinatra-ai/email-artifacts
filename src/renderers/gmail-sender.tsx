"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Label } from "../components/ui/label";
import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";

// COMPONENT-ONLY relocation (cinatra#1625 S8/M3, ruling 133-1): the
// visual Gmail sender picker moves into @cinatra-ai/email-artifacts. The host
// resolves this migrated component through the generated field-renderer
// component map keyed by the unchanged binding id
// (@cinatra-ai/email-outreach-agent:gmail-sender).
//
// The activation policy STAYS host-side: makeGmailSenderCondition (context
// gating on connected Gmail + aliases, plus the whitelist field-name heuristic)
// lives in core because it consumes the host-fixed provider-neutral
// email-sender field whitelist mechanism, which an extension cannot import.
// See packages/agents/src/gmail-sender-condition.ts + register-default-renderers.ts.

export function GmailSenderFieldRenderer({
  fieldName,
  value,
  onChange,
  disabled,
  required,
  error,
  label,
  description,
  context,
}: FieldRendererProps) {
  const aliases = context.gmailAliases ?? [];
  const stringValue = typeof value === "string" ? value : "";
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`field-${fieldName}`} className="text-foreground">
        {label}{required ? " *" : ""}
      </Label>
      <Select
        value={stringValue}
        onValueChange={(next) => onChange(next)}
        disabled={disabled}
      >
        <SelectTrigger id={`field-${fieldName}`} className="border-line">
          <SelectValue placeholder="Select a sender address" />
        </SelectTrigger>
        <SelectContent>
          {aliases.map((alias) => (
            <SelectItem key={alias.sendAsEmail} value={alias.sendAsEmail}>
              {alias.displayName ? `${alias.displayName} <${alias.sendAsEmail}>` : alias.sendAsEmail}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export default GmailSenderFieldRenderer;
