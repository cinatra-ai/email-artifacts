"use client";

// THE EMAIL BODY DISPLAY (slot `detail`) — the mail detail pane, drawn on the
// artifact's own page, on a review target, and on every other surface that
// mounts a display, unchanged.
//
// THE DRAWING (the ratified drawing, the displays the fleet adds): the body is
// the artifact, and it is read as mail. ONE VIEW — the sender block (the
// initials avatar, the name that will send it, and the address on the line
// right beneath that name), the date at the end of that same line, the subject
// under them, and the body under a rule. There is NO TAB STRIP and no second
// reading to switch to; there is NO REPLY FIELD AND NO COMPOSE AFFORDANCE of
// any kind — not inert, not disabled, ABSENT; and the pane DRAWS NO PICTURE:
// the avatar is the sender's initials set in a plain disc, never an image.
//
// WHAT IT NEVER CARRIES. No decision affordance — Comment, Regenerate and
// Continue belong to the review floor, drawn by the surface around the display.
// No renderer chip and no provenance line. No note row of its own: a save that
// does not go through reports through its indicator, never as a line written
// into the pane.
//
// EDITED IN PLACE, AND ONLY WHERE THE HOST SAYS SO. The body takes an edit in
// the pane itself — no edit mode to enter and no Save button to find — and the
// change is stored as it is made, through the host's own edit channel and no
// other road: the display posts to the address the capability carries and
// composes none of its own. Where the same artifact is a review target the host
// mints a refusal instead, and the pane is drawn read only by construction.
//
// THE SUBJECT IS DRAWN, NOT EDITED, AND THAT IS A MISSING HOST ROAD — recorded
// here for the host half rather than invented around. The drawing asks for the
// subject AND the body to be editable in place. The body is: the host's edit
// channel carries it. The subject is NOT, because the channel has no road for
// it and this pack composes none of its own:
//
//   * `ArtifactEditCapability` is sealed to an ARTIFACT (`artifactId`,
//     `baseRevisionId`, one `saveUrl`) — never to a field of one.
//   * `ArtifactEditRequest` is `{ channelVersion, baseRevisionId, text }` — ONE
//     whole document text, with no field selector beside it. Posting the
//     subject through it would store the subject AS the message body.
//   * The subject the pane draws is `artifact.title` on the props snapshot,
//     which the host projects as read-only row metadata.
//
// So the subject stays read-only in every surface until the host mints a road
// for it, and the pane draws no affordance that would suggest otherwise.
//
// A v1 renderer requests NO host ports and never fetches its content: every
// region above is drawn from the host-supplied, already access-checked props
// snapshot, which is what lets this pane draw inside a third-party application.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import type { ArtifactRendererProps } from "@cinatra-ai/sdk-extensions";
import {
  ARTIFACT_EDIT_IDLE_PAUSE_MS,
  saveArtifactEdit,
  type ArtifactEditOutcome,
} from "@cinatra-ai/sdk-extensions/artifact-edit-channel";

import { cn } from "../lib/utils";
import {
  EMAIL_DETAIL_GAP_SENTENCES,
  EMAIL_DETAIL_NOTICE_SENTENCES,
  emailDetailFloorMessage,
} from "./email-detail-contract";
import { resolveEmailDetailView } from "./email-detail-view";

/** What the indicator is saying.
 *
 *  `saving`     from the moment the reader changes the text until the change on
 *               screen is the change the store answered for.
 *  `saved`      once the text on screen is the text the store holds.
 *  `not-saved`  where a save did not go through — which NEVER reads as stored.
 *  `reloaded`   where the artifact moved on under the editor: the save was
 *               refused rather than written over, the newer revision is loaded
 *               in its place, and the reader's own change was NOT stored. It is
 *               its own word because "Saved" here would be a lie about work the
 *               editor just replaced on screen. */
type SavingState = "saved" | "saving" | "not-saved" | "reloaded";

const SAVING_LABEL: Record<SavingState, string> = {
  saved: "Saved",
  saving: "Saving…",
  "not-saved": "Not saved",
  reloaded: "Not saved — newer revision loaded",
};

function formatDate(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

export default function EmailArtifactsDetail(props: ArtifactRendererProps): ReactElement {
  const view = resolveEmailDetailView(props);
  const pane = view.kind === "pane" ? view : null;
  const capability = props?.edit;
  const granted = capability?.kind === "editable" ? capability : null;

  // THE EDIT SESSION — one artifact, opened at one revision. Everything the
  // editor holds (the reader's text, the queue, the timer, the base revision it
  // saves against) belongs to THIS session and to no other: a display instance
  // that is handed a different artifact, or the same artifact reopened at a
  // different revision, must not carry one session's unsent words into the
  // next, and must never post them under the next one's capability.
  const sessionKey =
    granted === null ? null : `${props?.artifact?.id ?? ""}::${granted.baseRevisionId}`;

  // THE EDITOR'S OWN TEXT, once the reader has touched it or a save came back
  // with a newer revision to reload onto. Until then the pane draws what the
  // channel handed it.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState<SavingState>("saved");
  // A STALE ANSWER MAY COME BACK CUT. The channel forbids saving a prefix over
  // a whole document, so an editor reloaded onto a truncated revision closes.
  const [reloadedTruncated, setReloadedTruncated] = useState(false);
  const [session, setSession] = useState<string | null>(sessionKey);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  /** The text the reader has written that the store has not answered for. */
  const pending = useRef<string | null>(null);
  /** Has the change set been BOUNDED yet — the idle pause elapsed, or the view
   *  going away? A bounded change set is ready to send; an unbounded one waits,
   *  which is what keeps one revision per thought rather than one per word. */
  const bounded = useRef(false);
  /** Is this change set the one the reader is LEAVING on? */
  const leaving = useRef(false);
  /** THE BASE THIS EDITOR NOW SAVES AGAINST. It opens at the revision the host
   *  minted the capability at and MOVES with every answer that names a newer
   *  one — the save road allocates a revision per stored change set, so a second
   *  edit sent against the first edit's base would be refused as stale and the
   *  reader's own work would be rolled back over by their own first save. */
  const base = useRef<string | null>(granted?.baseRevisionId ?? null);
  const grantRef = useRef(granted);
  grantRef.current = granted;

  // A NEW SESSION STARTS EMPTY. Adjusting the state while rendering (rather
  // than in an effect) is what keeps a stale draft from being drawn for one
  // frame under the next artifact's metadata.
  if (sessionKey !== session) {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
    bounded.current = false;
    leaving.current = false;
    base.current = granted?.baseRevisionId ?? null;
    setSession(sessionKey);
    setDraft(null);
    setSaving("saved");
    setReloadedTruncated(false);
  }

  const editable = pane?.editable === true && granted !== null && !reloadedTruncated;

  /** What ONE answer does to the editor. `sent` is the text that answer is
   *  about — the indicator may only read as stored when that text is still the
   *  text on screen. */
  const apply = useCallback((outcome: ArtifactEditOutcome, sent: string) => {
    switch (outcome.outcome) {
      case "saved":
        base.current = outcome.revisionId;
        setSaving(pending.current === null || pending.current === sent ? "saved" : "saving");
        return;
      case "unchanged":
        base.current = outcome.revisionId;
        setSaving(pending.current === null || pending.current === sent ? "saved" : "saving");
        return;
      case "stale":
        // A save onto a revision that moved on is REFUSED rather than written
        // over. The editor reloads onto the newer revision — and everything the
        // reader had queued behind the refused change set goes with it, because
        // sending it now would write the old document's words over the newer
        // revision through the back door.
        if (timer.current !== null) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        pending.current = null;
        bounded.current = false;
        base.current = outcome.latestRevisionId;
        setDraft(outcome.text);
        if (outcome.truncated) setReloadedTruncated(true);
        setSaving("reloaded");
        return;
      default:
        setSaving("not-saved");
    }
  }, []);

  // ONE CHANGE SET AT A TIME. The channel serialises nothing for us: a second
  // change set waits for the first to answer rather than racing it against the
  // same base.
  const flush = useCallback(async (): Promise<void> => {
    const grant = grantRef.current;
    if (grant === null) return;
    if (inFlight.current) return; // the answer in flight drains what waits.
    if (!bounded.current) return; // the pause has not elapsed yet.
    const text = pending.current;
    if (text === null) return;

    pending.current = null;
    bounded.current = false;
    const wasLeaving = leaving.current;
    leaving.current = false;
    inFlight.current = true;
    const outcome = await saveArtifactEdit(
      // THE CAPABILITY, AT THE REVISION THIS EDITOR NOW HOLDS. Nothing else on
      // it is composed here — the address is the host's own.
      { ...grant, baseRevisionId: base.current ?? grant.baseRevisionId },
      text,
      wasLeaving ? { leaving: true } : undefined,
    );
    inFlight.current = false;
    apply(outcome, text);
    if (pending.current !== null && bounded.current) await flush();
  }, [apply]);

  useEffect(
    () => () => {
      // LEAVING THE VIEW BOUNDS A CHANGE SET TOO. A pause that never elapsed
      // would otherwise lose the last thing the reader wrote — and the last
      // change set of a session is exactly the one most likely to be lost.
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (pending.current === null) return;
      bounded.current = true;
      leaving.current = true;
      // A save already in flight keeps the serialisation: it drains what waits
      // when it answers, and it carries the leaving mark with it.
      if (inFlight.current) return;
      void flush();
    },
    [flush],
  );

  const onEdit = useCallback(
    (text: string) => {
      setDraft(text);
      setSaving("saving");
      pending.current = text;
      bounded.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      const grant = grantRef.current;
      const pause =
        grant !== null && typeof grant.idlePauseMs === "number"
          ? grant.idlePauseMs
          : ARTIFACT_EDIT_IDLE_PAUSE_MS;
      timer.current = setTimeout(() => {
        timer.current = null;
        bounded.current = true;
        void flush();
      }, pause);
    },
    [flush],
  );

  if (pane === null) {
    return (
      <p data-region="floor" className="text-sm text-muted-foreground">
        {emailDetailFloorMessage(view.kind === "floor" ? view.reason : "malformed-props")}
      </p>
    );
  }

  const dateLabel = pane.dateIso === null ? null : formatDate(pane.dateIso);
  const bodyText = draft ?? pane.editorText ?? pane.body?.markdown ?? "";

  return (
    <section data-region="pane" aria-label="Message" className="text-foreground">
      {editable ? (
        <div className="flex items-center justify-end px-3.5 pt-3">
          <span
            role="status"
            data-region="saving-indicator"
            data-state={saving}
            className={cn(
              "text-xs",
              saving === "saved" || saving === "saving"
                ? "text-muted-foreground"
                : "text-destructive",
            )}
          >
            {SAVING_LABEL[saving]}
          </span>
        </div>
      ) : null}

      <div className="p-3.5">
        <div data-region="sender-block" className="flex items-start gap-3">
          {pane.sender === null ? (
            <p data-region="sender-gap" className="min-w-0 flex-1 text-xs text-muted-foreground">
              {EMAIL_DETAIL_GAP_SENTENCES.sender}
            </p>
          ) : (
            <>
              {/* A PLAIN DISC OF INITIALS, never an image. */}
              <span
                aria-hidden="true"
                data-region="avatar"
                className="grid size-9 flex-none place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
              >
                {pane.sender.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div data-region="sender-name" className="text-sm font-semibold text-foreground">
                  {pane.sender.name ?? pane.sender.address}
                </div>
                {/* THE ADDRESS, ON THE LINE RIGHT BENEATH THE NAME, and with no
                    prefix of any kind. It is the sending account's own — the
                    address the message goes to is a record of its own, which
                    projects nothing. */}
                {pane.sender.address === null ? null : (
                  <div
                    data-region="sender-address"
                    className="mt-0.5 font-mono text-xs text-muted-foreground"
                  >
                    {pane.sender.address}
                  </div>
                )}
              </div>
            </>
          )}
          {dateLabel === null ? (
            <span data-region="date" data-gap="true" className="ml-auto flex-none text-xs text-muted-foreground">
              {EMAIL_DETAIL_GAP_SENTENCES.date}
            </span>
          ) : (
            <time
              data-region="date"
              dateTime={pane.dateIso ?? undefined}
              className="ml-auto flex-none whitespace-nowrap text-xs text-muted-foreground"
            >
              {dateLabel}
            </time>
          )}
        </div>

        {pane.subject === null ? (
          <p data-region="subject" data-gap="true" className="mt-3 text-sm text-muted-foreground">
            {EMAIL_DETAIL_GAP_SENTENCES.subject}
          </p>
        ) : (
          <p data-region="subject" className="mt-3 text-sm font-semibold leading-snug text-foreground">
            {pane.subject}
          </p>
        )}

        {/* WHICH OF THE TWO THIS READING IS. An object-backed row is the live
            row or a minted snapshot, and the pane says which: a live row can
            still move under the reader, a snapshot is what a decision binds. */}
        {pane.objectSource === null ? null : (
          <p
            data-region="source"
            data-source={pane.objectSource}
            className="mt-2 text-xs text-muted-foreground"
          >
            {EMAIL_DETAIL_NOTICE_SENTENCES[pane.objectSource]}
          </p>
        )}
      </div>

      {/* THE BODY, UNDER A RULE. */}
      <hr data-region="rule" className="border-border" />

      <div className="p-3.5">
        {/* THE MESSAGE WAS CUT TO GET HERE, so the pane says so on the body it
            is drawing rather than passing a beginning off as the message. */}
        {pane.truncated ? (
          <p data-region="truncation-notice" className="mb-2 text-xs text-muted-foreground">
            {EMAIL_DETAIL_NOTICE_SENTENCES.truncated}
          </p>
        ) : null}
        {editable ? (
          <textarea
            data-region="body-editor"
            aria-label="Message body"
            value={bodyText}
            onChange={(event) => onEdit(event.target.value)}
            className="min-h-40 w-full resize-y border-0 bg-transparent p-0 text-sm leading-relaxed text-foreground outline-none focus-visible:outline-none"
          />
        ) : pane.body === null ? (
          <p data-region="body" data-gap="true" className="text-sm text-muted-foreground">
            {EMAIL_DETAIL_GAP_SENTENCES.body}
          </p>
        ) : (
          // The html is the SDK sanitizer's own output and nothing else — the
          // one boundary this pack runs somebody else's document through.
          <div
            data-region="body"
            className="text-sm leading-relaxed text-foreground [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: pane.body.html }}
          />
        )}
      </div>
    </section>
  );
}
