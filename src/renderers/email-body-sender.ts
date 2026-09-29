// THE SENDING ACCOUNT IN A DRAFT'S OWN CONTENT (cinatra#3816) — how the body
// type's content names the account that will send it: a name and an address.
//
// A draft body is filed as ONE text: the markdown of the message. The agent
// that writes the draft knows the account that will send it, and it names it
// in a HEAD LINE before the message. The text's first line is the marker
// comment, written exactly as:
//
//   <!-- email-sender {"name":"Anna Keller","address":"anna.keller@acme.example"} -->
//
// that is, the literal `<!-- email-sender `, a JSON object on that one line and
// the literal ` -->`; then one line break, an optional blank line, and the
// message. The object's `name` and `address` are both non-empty strings after
// trimming, the address has exactly one "@" and no white space, and neither
// value carries a line break or the comment close. Any other first line is no
// head, and the text is then taken whole, as it was stored.
//
// A DRAFT WITHOUT A HEAD STAYS VALID: it names no sending account, and the pane
// draws its state without a sender.
//
// WHY A COMMENT. Every markdown reading through the shared sanitizer drops a
// comment, so a display that does not know the head still draws the message
// alone; and the head travels inside the one text every road already carries.
//
// SANITIZER-FREE, like the view contract: this module imports nothing at all.

export const EMAIL_BODY_SENDER_MARKER = "email-sender";

export type EmailBodySender = { name: string; address: string };

export type EmailBodyParts = {
  /** The account the head names, and null where the content names none. */
  sender: EmailBodySender | null;
  /** The head EXACTLY as stored — its line, its line break and the blank line
   *  after it — so an edit in place writes it back byte for byte. Empty where
   *  the content names no sender. */
  head: string;
  /** The message: the stored text after the head, or the whole text. */
  body: string;
};

const HEAD_LINE = /^<!-- email-sender (\{[^\r\n]*\}) -->(\r?\n(?:\r?\n)?)/;
const ADDRESS = /^[^\s@]+@[^\s@]+$/;

function cleanValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/[\r\n]/.test(value) || value.includes("-->")) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Split a stored draft text into the sender its head names and the message.
 *  Total: it returns parts for every input and never throws. */
export function readEmailBodySender(text: string): EmailBodyParts {
  const whole: EmailBodyParts = { sender: null, head: "", body: typeof text === "string" ? text : "" };
  if (typeof text !== "string") return whole;
  const match = HEAD_LINE.exec(text);
  if (match === null || match[1]!.includes("-->")) return whole;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]!);
  } catch {
    return whole;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return whole;
  const name = cleanValue((parsed as Record<string, unknown>).name);
  const address = cleanValue((parsed as Record<string, unknown>).address);
  if (name === null || address === null || !ADDRESS.test(address)) return whole;
  return { sender: { name, address }, head: match[0], body: text.slice(match[0].length) };
}

/** Put a stored head back in front of an edited message. */
export function joinEmailBodyHead(head: string, body: string): string {
  return head + body;
}
