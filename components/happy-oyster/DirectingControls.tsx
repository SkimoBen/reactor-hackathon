"use client";

// Directing (mode 2) control deck: steer the story with free-text instructions
// plus pause / resume / rewind transport, over the live instruction timeline
// the runtime reconciles into travel_state. Rewind needs the session paused and
// snaps to multiples of 4 seconds (the server rounds down).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useHappyOysterClient } from "./ho-client";
import { FIELD, Hint, Panel, SectionLabel } from "./ui";

export function DirectingControls() {
  const { instruct, pause, resume, rewind, travelState, travelStatus } =
    useHappyOysterClient();
  const [text, setText] = useState("");
  const [rewindSec, setRewindSec] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paused = travelStatus === "paused";

  const run = (action: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    void action()
      .catch((cause) => setError(String(cause)))
      .finally(() => setBusy(false));
  };

  const send = () => {
    if (!text.trim()) return;
    run(() => instruct(text.trim()).then(() => setText("")));
  };

  const instructions = travelState?.user_instructions ?? [];
  const chapters = travelState?.chapters ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="flex items-center justify-between">
          <SectionLabel>Direct the story</SectionLabel>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium capitalize text-muted-foreground">
            {travelStatus}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            placeholder="Steer the next scene… “A storm rolls in”"
            className={`${FIELD} min-w-0 flex-1`}
          />
          <Button
            className="h-auto shrink-0"
            disabled={busy || text.trim().length === 0}
            onClick={send}
          >
            Instruct
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {paused ? (
            <TransportButton disabled={busy} onClick={() => run(resume)}>
              ▶ Resume
            </TransportButton>
          ) : (
            <TransportButton disabled={busy} onClick={() => run(pause)}>
              ⏸ Pause
            </TransportButton>
          )}
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step={4}
              value={rewindSec}
              onChange={(event) =>
                setRewindSec(Math.max(0, Number(event.target.value)))
              }
              className={`${FIELD} w-16 px-2.5 py-1.5 tabular-nums`}
            />
            <TransportButton
              disabled={busy || !paused}
              title={paused ? "Rewind to this second" : "Pause first to rewind"}
              onClick={() => run(() => rewind(rewindSec))}
            >
              ⏪ Rewind
            </TransportButton>
          </div>
        </div>
        <Hint>
          Instructions steer the next chunk. Rewind takes multiples of 4s and
          needs the session paused first.
        </Hint>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
      </Panel>

      <Panel>
        <SectionLabel>Story timeline</SectionLabel>
        {instructions.length === 0 && chapters.length === 0 ? (
          <Hint>
            Your instructions appear here with the window HappyOyster schedules
            them into on the video timeline.
          </Hint>
        ) : (
          <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1">
            {instructions.map((instruction, index) => (
              <div
                key={`${instruction.instruction}-${index}`}
                className="flex items-baseline justify-between gap-3 rounded-[10px] bg-muted px-3.5 py-2"
              >
                <span className="min-w-0 truncate text-[13px] text-foreground">
                  {instruction.instruction}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {instruction.start_time != null &&
                  instruction.end_time != null
                    ? `${instruction.start_time}s–${instruction.end_time}s`
                    : (instruction.status ?? "scheduled")}
                </span>
              </div>
            ))}
            {chapters.map((chapter, index) => (
              <div
                key={`chapter-${chapter.chapter_id ?? index}`}
                className="flex items-baseline justify-between gap-3 rounded-[10px] bg-primary/[0.07] px-3.5 py-2"
              >
                <span className="min-w-0 truncate text-[13px] font-medium text-primary">
                  {chapter.title ??
                    `Chapter ${chapter.chapter_id ?? index + 1}`}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {chapter.start_time != null && chapter.end_time != null
                    ? `${chapter.start_time}s–${chapter.end_time}s`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function TransportButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="flex-1 whitespace-nowrap rounded-full bg-fill px-3 py-2 text-[13px] font-medium text-foreground transition hover:bg-[#dcdce1] disabled:opacity-35"
    >
      {children}
    </button>
  );
}
