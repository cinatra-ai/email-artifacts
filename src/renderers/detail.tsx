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
// THE SUBJECT IS EDITED IN PLACE WHERE THE CAPABILITY ADMITS THE TITLE. The
// subject the pane draws is the artifact's title, and the host's edit channel
// carries the title as its own field beside the text: one capability, one base,
// one save address. Where the capability names the title the subject is a
// single-line field in its own place, saved through the channel's title field
// under the same pause, queue and moving base as the body. Everywhere else — an
// older capability, a review target, a record — the subject is drawn as text,
// and the pane draws no affordance that would suggest otherwise.
//
// A v1 renderer requests NO host ports and never fetches its content: every
// region above is drawn from the host-supplied, already access-checked props
// snapshot, which is what lets this pane draw inside a third-party application.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import type { ArtifactRendererProps } from "@cinatra-ai/sdk-extensions";
import {
  ARTIFACT_EDIT_IDLE_PAUSE_MS,
  saveArtifactEdit,
  saveArtifactTitleEdit,
  type ArtifactEditOutcome,
} from "@cinatra-ai/sdk-extensions/artifact-edit-channel";

import { cn } from "../lib/utils";
import {
  EMAIL_DETAIL_GAP_SENTENCES,
  EMAIL_DETAIL_NOTICE_SENTENCES,
  emailDetailFloorMessage,
} from "./email-detail-contract";
import { emailSenderInitials, resolveEmailDetailView } from "./email-detail-view";
import { EmailBodyHtml } from "./email-body-html";
import { joinEmailBodyHead, readEmailBodySender, type EmailBodyParts } from "./email-body-sender";

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
  // A NEWER REVISION LOADED UNDER THE EDITOR brings its own head: the pane
  // draws that revision's sender, never the one it opened on.
  const [reloaded, setReloaded] = useState<EmailBodyParts | null>(null);
  /** THE SUBJECT'S OWN DRAFT, null until the reader touches it or a reload
   *  puts a newer title in its place. */
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(sessionKey);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  /** The text the reader has written that the store has not answered for. */
  const pending = useRef<string | null>(null);
  /** The subject the reader has written that the store has not answered for. */
  const pendingTitle = useRef<string | null>(null);
  /** The title the store last answered for — opened from the view's subject. */
  const storedTitle = useRef<string | null>(pane?.subject ?? null);
  /** A field whose last send did not go through: the other field's later save
   *  must not read Saved over it. Cleared when that field is stored again. */
  const unsaved = useRef<{ text: boolean; title: boolean }>({ text: false, title: false });
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
  /** THE HEAD THIS EDITOR WRITES BACK in front of every change set — the line
   *  that names the sending account, exactly as the revision it saves against
   *  stores it — so an edit of the body keeps the sender as it was filed. */
  const head = useRef<string>(pane?.editorHead ?? "");

  // A NEW SESSION STARTS EMPTY. Adjusting the state while rendering (rather
  // than in an effect) is what keeps a stale draft from being drawn for one
  // frame under the next artifact's metadata.
  if (sessionKey !== session) {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
    pendingTitle.current = null;
    storedTitle.current = pane?.subject ?? null;
    unsaved.current = { text: false, title: false };
    bounded.current = false;
    leaving.current = false;
    base.current = granted?.baseRevisionId ?? null;
    head.current = pane?.editorHead ?? "";
    setSession(sessionKey);
    setDraft(null);
    setSubjectDraft(null);
    setSaving("saved");
    setReloadedTruncated(false);
    setReloaded(null);
  }

  const editable = pane?.editable === true && granted !== null && !reloadedTruncated;

  /** What ONE answer does to the editor. `sent` is the text (or, for `field`
   *  "title", the subject) that answer is about — the indicator may only read
   *  as stored when neither a text nor a title is still waiting to be sent. */
  const apply = useCallback((outcome: ArtifactEditOutcome, sent: string, field: "text" | "title") => {
    const settled = () =>
      (pending.current === null || (field === "text" && pending.current === sent)) &&
      (pendingTitle.current === null || (field === "title" && pendingTitle.current === sent));
    const stored = (): SavingState =>
      settled() ? (unsaved.current.text || unsaved.current.title ? "not-saved" : "saved") : "saving";
    switch (outcome.outcome) {
      case "saved":
        base.current = outcome.revisionId;
        if (field === "title") storedTitle.current = sent;
        unsaved.current[field] = false;
        setSaving(stored());
        return;
      case "unchanged":
        base.current = outcome.revisionId;
        if (field === "title") storedTitle.current = sent;
        unsaved.current[field] = false;
        setSaving(stored());
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
        pendingTitle.current = null;
        unsaved.current = { text: false, title: false };
        bounded.current = false;
        base.current = outcome.latestRevisionId;
        {
          // The newer revision's head moves in under the editor with it.
          const parts = readEmailBodySender(outcome.text);
          head.current = parts.head;
          setReloaded(parts);
          setDraft(parts.body);
        }
        // The subject reloads too: to the title the answer carries, or — on a
        // text change's answer, which carries none — to the title the store
        // last answered for.
        if ("title" in outcome) storedTitle.current = outcome.title ?? null;
        setSubjectDraft(storedTitle.current ?? "");
        if (outcome.truncated) setReloadedTruncated(true);
        setSaving("reloaded");
        return;
      default:
        unsaved.current[field] = true;
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
    const title = pendingTitle.current;
    const text = pending.current;
    if (title === null && text === null) return;

    // A PENDING TITLE GOES FIRST, then the text, each against the base the
    // previous answer named. What is still pending after this send stays
    // bounded, so the answer drains it.
    const wasLeaving = leaving.current;
    if (title !== null) {
      pendingTitle.current = null;
    } else {
      pending.current = null;
    }
    if (pending.current === null && pendingTitle.current === null) {
      bounded.current = false;
      leaving.current = false;
    }
    inFlight.current = true;
    // THE CAPABILITY, AT THE REVISION THIS EDITOR NOW HOLDS. Nothing else on
    // it is composed here — the address is the host's own.
    const capability = { ...grant, baseRevisionId: base.current ?? grant.baseRevisionId };
    const deps = wasLeaving ? { leaving: true } : undefined;
    if (title !== null) {
      const outcome = await saveArtifactTitleEdit(capability, title, deps);
      inFlight.current = false;
      apply(outcome, title, "title");
    } else {
      const outcome = await saveArtifactEdit(
        capability,
        joinEmailBodyHead(head.current, text as string),
        deps,
      );
      inFlight.current = false;
      apply(outcome, text as string, "text");
    }
    if (pending.current === null && pendingTitle.current === null) leaving.current = false;
    if ((pending.current !== null || pendingTitle.current !== null) && bounded.current) await flush();
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
      if (pending.current === null && pendingTitle.current === null) return;
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

  // THE SUBJECT'S EDIT, under the SAME pause as the body's: a change to either
  // field restarts the one pause, and the one queue sends both.
  const onSubjectEdit = useCallback(
    (title: string) => {
      setSubjectDraft(title);
      setSaving("saving");
      pendingTitle.current = title;
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

  // THE PANE DRAWS THE BODY WHOLE. On the artifact's own page the body sits in
  // the editor, and the editor stands as tall as the words it holds — never a
  // fixed box that hides the rest of the message behind a scroll of its own.
  const editor = useRef<HTMLTextAreaElement | null>(null);
  const editorText = draft ?? pane?.editorText ?? pane?.body?.markdown ?? "";
  useLayoutEffect(() => {
    const node = editor.current;
    if (node === null) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [editorText, editable]);

  if (pane === null) {
    return (
      <p data-region="floor" className="text-sm text-muted-foreground">
        {emailDetailFloorMessage(view.kind === "floor" ? view.reason : "malformed-props")}
      </p>
    );
  }

  const dateLabel = pane.dateIso === null ? null : formatDate(pane.dateIso);
  // THE SENDER THE CONTENT ON SCREEN NAMES: the reloaded revision's once a
  // reload put its message in the editor, else the one the pane opened on (a
  // cut reload closes the editor and the pane draws the opened message).
  const sender =
    reloaded === null || reloadedTruncated
      ? pane.sender
      : reloaded.sender === null
        ? null
        : {
            ...reloaded.sender,
            initials: emailSenderInitials(reloaded.sender.name, reloaded.sender.address),
          };
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
          {sender === null ? (
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
                {sender.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div data-region="sender-name" className="text-sm font-semibold text-foreground">
                  {sender.name ?? sender.address}
                </div>
                {/* THE ADDRESS, ON THE LINE RIGHT BENEATH THE NAME, and with no
                    prefix of any kind. It is the sending account's own — the
                    address the message goes to is a record of its own, which
                    projects nothing. */}
                {sender.address === null ? null : (
                  <div
                    data-region="sender-address"
                    className="mt-0.5 font-mono text-xs text-muted-foreground"
                  >
                    {sender.address}
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

        {pane.subjectEditable && editable ? (
          <input
            type="text"
            data-region="subject-editor"
            aria-label="Subject"
            placeholder={EMAIL_DETAIL_GAP_SENTENCES.subject}
            value={subjectDraft ?? pane.subject ?? ""}
            onChange={(event) => onSubjectEdit(event.target.value)}
            className="mt-3 w-full border-0 bg-transparent p-0 text-sm font-semibold leading-snug text-foreground outline-none focus-visible:outline-none"
            style={{ backgroundColor: "transparent" }}
          />
        ) : pane.subject === null ? (
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
            ref={editor}
            data-region="body-editor"
            aria-label="Message body"
            value={bodyText}
            onChange={(event) => onEdit(event.target.value)}
            className="min-h-40 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-relaxed text-foreground outline-none focus-visible:outline-none"
            style={{ backgroundColor: "transparent" }}
          />
        ) : pane.body === null ? (
          <p data-region="body" data-gap="true" className="text-sm text-muted-foreground">
            {EMAIL_DETAIL_GAP_SENTENCES.body}
          </p>
        ) : (
          <EmailBodyHtml html={pane.body.html} />
        )}
      </div>
    </section>
  );
}
