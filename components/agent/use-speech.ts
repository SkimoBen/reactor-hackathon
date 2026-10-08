"use client";

// Push-to-talk voice transcription through the browser's Web Speech API (Chrome
// and Safari; Chrome streams the audio to Google for recognition). The mic is
// only live while the user holds the space bar (or the panel's mic button).
// Each finished phrase goes to onFinal — the Concierge's trigger — and the
// phrase still being spoken is exposed as `interim` so the panel can show it
// as it forms.
//
// Recognition stops on its own after silence, so while the key is held it is
// restarted from onend. Releasing the key calls stop(), which lets the
// recognizer finalize what it heard; whatever is still interim when it ends is
// sent as the last phrase so a quick release doesn't drop words.
//
// The microphone prompt needs a user gesture, so prime() runs from the Explore
// click to ask up front rather than on the first key press.

import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
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

export function useSpeech(
  onFinal: (text: string) => void,
  enabled: boolean,
): Speech {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const pending = useRef("");
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Feature-detect after mount so the server render and first client render agree.
  useEffect(() => setSupported(!!recognitionCtor()), []);

  const stop = useCallback(() => {
    if (!wanted.current) return;
    wanted.current = false;
    // stop(), not abort(): the recognizer still delivers what it heard.
    recognition.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || !enabledRef.current || wanted.current) return;
    wanted.current = true;
    setError(null);
    if (!recognition.current) {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (event) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript.trim();
          if (!text) continue;
          if (result.isFinal) finalRef.current(text);
          else interimText += `${text} `;
        }
        pending.current = interimText.trim();
        setInterim(pending.current);
      };
      rec.onerror = (event) => {
        // "no-speech" and "aborted" are routine; the onend restart covers them.
        if (event.error === "no-speech" || event.error === "aborted") return;
        wanted.current = false;
        setListening(false);
        setError(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Microphone access was blocked."
            : `Voice input stopped (${event.error}).`,
        );
      };
      rec.onend = () => {
        // Released mid-phrase: send what was heard rather than dropping it.
        if (pending.current) finalRef.current(pending.current);
        pending.current = "";
        setInterim("");
        if (wanted.current) {
          try {
            rec.start();
          } catch {
            // Already restarting.
          }
        } else setListening(false);
      };
      recognition.current = rec;
    }
    setListening(true);
    try {
      recognition.current.start();
    } catch {
      // Still winding down from the last release; onend restarts it.
    }
  }, []);

  const prime = useCallback(() => {
    if (!recognitionCtor() || !navigator.mediaDevices?.getUserMedia) return;
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
