"use client";

// Push-to-talk voice transcription through Gemini 3.5 Transcribe Live
// (lib/transcriber.ts): the mic streams to Gemini over a single-use ephemeral
// token from /api/gemini/token, so the Gemini key never reaches the browser,
// and it works in any browser with a microphone and AudioWorklet (Firefox
// included). The mic is only live while the user holds the space bar (or the
// panel's mic button). Each finished phrase goes to onFinal — the Concierge's
// trigger — and the phrase still being spoken is exposed as `interim` so the
// panel can show it as it forms.
//
// Every press opens its own transcription session; audio captured while it
// connects is held and sent once it's up, so the first words aren't lost.
// Releasing stops the mic and lets Gemini finalize what it heard; whatever is
// still interim when the session closes is sent as the last phrase so a quick
// release doesn't drop words.
//
// The microphone prompt needs a user gesture, so prime() runs from the Explore
// click to ask up front rather than on the first key press.

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveTranscriber } from "@/lib/transcriber";

function micSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioWorkletNode !== "undefined"
  );
}

// Space typed into a field is text, not push-to-talk.
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export interface Speech {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  prime: () => void;
}

// One hold of the key: its own transcriber, and the hypothesis it last
// reported, which becomes the final phrase if Gemini never commits it.
interface Press {
  transcriber: LiveTranscriber;
  started: Promise<boolean>;
  interim: string;
}

export function useSpeech(
  onFinal: (text: string) => void,
  enabled: boolean,
): Speech {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const wanted = useRef(false);
  // The press whose interim the panel shows: the one being held, or the last
  // one while it finishes. An older press may still be finishing behind it.
  const shown = useRef<Press | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Feature-detect after mount so the server render and first client render agree.
  useEffect(() => setSupported(micSupported()), []);

  const start = useCallback(() => {
    if (!micSupported() || !enabledRef.current || wanted.current) return;
    wanted.current = true;
    setError(null);
    setListening(true);
    const press = { interim: "" } as Press;
    press.transcriber = new LiveTranscriber({
      onStatus: (status, detail) => {
        if (status !== "error") return;
        setError(detail ?? "Voice input stopped.");
        if (shown.current === press) {
          wanted.current = false;
          shown.current = null;
          setListening(false);
          setInterim("");
        }
      },
      onInterim: (text) => {
        press.interim = text;
        if (shown.current === press) setInterim(text);
      },
      onFinal: (text) => {
        // The committed text replaces the hypothesis, so it can't resurface
        // as a duplicate "last phrase" on release.
        press.interim = "";
        if (shown.current === press) setInterim("");
        const phrase = text.trim();
        if (phrase) finalRef.current(phrase);
      },
      onLevel: () => {},
    });
    press.started = press.transcriber.start({ mode: "SMART", languages: [] });
    shown.current = press;
  }, []);

  const stop = useCallback(() => {
    if (!wanted.current) return;
    wanted.current = false;
    setListening(false);
    const press = shown.current;
    if (!press) return;
    void (async () => {
      // A quick tap can release before the mic is even live; let the start
      // settle, then finish, which waits for Gemini's last words.
      if (await press.started) await press.transcriber.finish();
      // Released mid-phrase: send what was heard rather than dropping it.
      const tail = press.interim.trim();
      if (tail) finalRef.current(tail);
      if (shown.current === press) {
        shown.current = null;
        setInterim("");
      }
    })();
  }, []);

  const prime = useCallback(() => {
    if (!micSupported()) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((track) => track.stop()))
      .catch(() => setError("Microphone access was blocked."));
  }, []);

  // Hold space to talk, while enabled.
  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    const onDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTyping(event.target)) return;
      // Keep space from scrolling the page or pressing a focused button.
      event.preventDefault();
      if (!event.repeat) start();
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !wanted.current) return;
      event.preventDefault();
      stop();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    // Switching away mid-hold never delivers the keyup.
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", stop);
      stop();
    };
  }, [enabled, start, stop]);

  return { supported, listening, interim, error, start, stop, prime };
}
