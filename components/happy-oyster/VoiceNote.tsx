"use client";

// A voice note: press to record, press again to stop, and the transcript is
// handed to `onNote`. Transcription is Gemini 3.5 Transcribe Live (see
// lib/transcriber.ts) in SMART mode, which drops filler words and false
// starts, so the text reads like something typed. While recording, the live
// caption shows committed text plus Gemini's in-progress hypothesis.
//
// On stop, the transcriber waits for Gemini to commit the last utterance. If
// it never does, the last hypothesis stands in for it, so a note ended
// mid-sentence still keeps its tail.
//
// Two looks: "light" for the sidebar's white cards, "dark" for the agents'
// floating console.

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveTranscriber } from "@/lib/transcriber";

type NoteState = "idle" | "starting" | "recording" | "finishing";

const TONES = {
  light: {
    idle: "bg-fill text-foreground hover:bg-border/60",
    active: "bg-destructive/10 text-destructive hover:bg-destructive/15",
    dot: "bg-tertiary",
    track: "bg-fill",
    link: "text-primary hover:underline",
    caption: "bg-muted text-foreground",
    placeholder: "text-tertiary",
    issue: "text-warning",
    error: "text-destructive",
  },
  dark: {
    idle: "bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white",
    active: "bg-red-500/15 text-red-200 hover:bg-red-500/25",
    dot: "bg-white/40",
    track: "bg-white/10",
    link: "text-white/45 hover:text-white/80",
    caption: "border border-white/[0.06] bg-black/30 text-white/70",
    placeholder: "text-white/30",
    issue: "text-amber-300/80",
    error: "text-red-300/90",
  },
} as const;

export function VoiceNote({
  onNote,
  label = "Voice note",
  disabled = false,
  tone = "light",
}: {
  onNote: (text: string) => void;
  label?: string;
  disabled?: boolean;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  const [state, setState] = useState<NoteState>("idle");
  const [caption, setCaption] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Why the session is struggling (e.g. a missing GEMINI_API_KEY) while it
  // retries, so an empty note reports the cause, not "didn't catch anything".
  const [issue, setIssue] = useState<string | null>(null);
  const issueRef = useRef<string | null>(null);
  const committed = useRef<string[]>([]);
  const interim = useRef("");
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const onNoteRef = useRef(onNote);
  useEffect(() => {
    onNoteRef.current = onNote;
  });

  const heard = () =>
    [...committed.current, interim.current]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const transcriber = useCallback(() => {
    transcriberRef.current ??= new LiveTranscriber({
      onStatus: (status, detail) => {
        if (status === "error") {
          setError(detail ?? "Transcription failed.");
          setState("idle");
        } else if (status === "reconnecting" && detail) {
          issueRef.current = detail;
          setIssue(detail);
        } else if (status === "listening") {
          issueRef.current = null;
          setIssue(null);
        }
      },
      onInterim: (text) => {
        interim.current = text;
        setCaption(heard());
      },
      onFinal: (text) => {
        committed.current.push(text.trim());
        interim.current = "";
        setCaption(heard());
      },
      onLevel: setLevel,
    });
    return transcriberRef.current;
  }, []);

  useEffect(() => () => transcriberRef.current?.stop(), []);

  async function start() {
    setError(null);
    issueRef.current = null;
    setIssue(null);
    committed.current = [];
    interim.current = "";
    setCaption("");
    setState("starting");
    const live = await transcriber().start({ mode: "SMART", languages: [] });
    setState(live ? "recording" : "idle");
  }

  async function finish() {
    setState("finishing");
    await transcriber().finish();
    const text = heard();
    setState("idle");
    setCaption("");
    setIssue(null);
    if (text) onNoteRef.current(text);
    else setError(issueRef.current ?? "Didn't catch anything, try again.");
  }

  function cancel() {
    transcriber().stop();
    setState("idle");
    setCaption("");
  }

  const recording = state === "recording";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          // `disabled` only blocks starting a note; one in progress can always stop.
          disabled={(disabled && state === "idle") || state === "finishing"}
          onClick={() =>
            void (state === "idle" ? start() : recording ? finish() : cancel())
          }
          className={`inline-flex shrink-0 items-center gap-2 rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition disabled:opacity-40 ${
            state === "idle" ? t.idle : t.active
          }`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              state === "idle" ? t.dot : "animate-pulse bg-red-500"
            }`}
          />
          {state === "idle"
            ? label
            : state === "starting"
              ? "Starting mic…"
              : recording
                ? "Stop & use"
                : "Transcribing…"}
        </button>
        {recording && (
          <>
            <div
              className={`h-1 min-w-0 flex-1 overflow-hidden rounded-full ${t.track}`}
            >
              <div
                className="h-full bg-primary transition-[width] duration-100"
                style={{ width: `${Math.min(100, level * 400)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={cancel}
              className={`shrink-0 text-[12px] transition ${t.link}`}
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {state !== "idle" && (
        <p
          className={`min-h-9 rounded-xl px-3.5 py-2 text-[13px] leading-relaxed ${t.caption}`}
        >
          {caption || (
            <span className={t.placeholder}>
              {state === "starting" ? "Allow the mic…" : "Listening…"}
            </span>
          )}
        </p>
      )}
      {issue && state !== "idle" && (
        <p className={`text-[12px] ${t.issue}`}>Retrying: {issue}</p>
      )}
      {error && <p className={`text-[12px] ${t.error}`}>{error}</p>}
    </div>
  );
}
