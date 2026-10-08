"use client";

// The whole experience is one rounded stage. Before the world is up it shows
// the splash photo under a heavy gaussian blur; once a travel is streaming the
// live world fills it edge to edge. Whatever the session's view, there is a
// single dock at the bottom centre with the one thing you can do next —
// Explore, Cancel, End, Explore again — and the agents' transcript panel
// (passed in as children) floats in the top-right corner.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import splash from "@/assets/splash image.jpg";
import { TRAVEL_SECONDS } from "@/lib/worlds";
import { useVideoSlot } from "./ho-client";
import type { JourneyStep } from "@/lib/view";
import type { WorldSession } from "./use-world-session";
import { Spinner } from "./ui";

export function Stage({
  session,
  onExplore,
  preparing,
  startError,
  children,
}: {
  session: WorldSession;
  /** Start the preset world. */
  onExplore: () => void;
  /** The preset world's first frame is still being fetched. */
  preparing: boolean;
  startError: string | null;
  children?: ReactNode;
}) {
  const { view } = session;
  const videoSlot = useVideoSlot();
  const live = view.kind === "traveling" && view.live;

  return (
    <section className="relative h-full w-full overflow-hidden rounded-[28px] bg-[#a8a2a6] shadow-[0_2px_8px_rgba(0,0,0,0.04),0_24px_64px_rgba(0,0,0,0.08)] sm:rounded-[36px]">
      {view.kind === "traveling" && videoSlot}

      {/* The splash, blurred — fades away once the world is streaming. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ${
          live ? "opacity-0" : "opacity-100"
        }`}
      >
        {/* Bled past the stage on every side so the blur never fades to its edge. */}
        <div className="absolute -inset-16">
          <Image
            src={splash}
            alt=""
            fill
            priority
            sizes="50vw"
            placeholder="blur"
            className="object-cover blur-[28px] saturate-[1.15]"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/20" />
      </div>

      {children}

      {(view.kind === "ready" || view.kind === "error") && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center gap-2 rounded-[24px] bg-white/70 px-8 py-7 text-center shadow-[0_8px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150">
            {view.kind === "ready" ? (
              <>
                <h2 className="text-[28px] font-semibold tracking-[-0.022em] text-foreground">
                  Your walk has ended.
                </h2>
                <p className="text-[15px] leading-[1.45] text-muted-foreground">
                  The world is still here. Step back in whenever you like.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-[28px] font-semibold tracking-[-0.022em] text-foreground">
                  {view.buildFailed ? "The world didn’t build." : "Something broke."}
                </h2>
                <p className="break-words text-[15px] leading-[1.45] text-muted-foreground">
                  {view.message}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-3 px-4 sm:bottom-10">
        <Dock
          session={session}
          onExplore={onExplore}
          preparing={preparing}
        />
        {startError && view.kind === "browse" && (
          <p className="rounded-full bg-white/75 px-4 py-1.5 text-[13px] text-destructive backdrop-blur-xl">
            {startError}
          </p>
        )}
      </div>
    </section>
  );
}

function Dock({
  session,
  onExplore,
  preparing,
}: {
  session: WorldSession;
  onExplore: () => void;
  preparing: boolean;
}) {
  const { view } = session;
  switch (view.kind) {
    case "browse":
      return (
        <PrimaryButton onClick={onExplore} disabled={preparing}>
          {preparing ? "Starting…" : "Explore New York"}
        </PrimaryButton>
      );
    case "connecting":
    case "building":
      return <LoadingCard session={session} />;
    case "traveling":
      return view.live ? (
        <TravelPill session={session} />
      ) : (
        <LoadingCard session={session} />
      );
    case "ready":
      return (
        <div className="flex items-center gap-2.5">
          <SecondaryButton onClick={session.exit}>Done</SecondaryButton>
          <PrimaryButton
            onClick={session.beginTravel}
            disabled={session.starting}
          >
            {session.starting ? "Starting…" : "Explore again"}
          </PrimaryButton>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-2.5">
          <SecondaryButton onClick={session.exit}>Back</SecondaryButton>
          <PrimaryButton onClick={session.retry}>Try again</PrimaryButton>
        </div>
      );
  }
}

// ── the dock's pieces ────────────────────────────────────────────────────────

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-12 select-none rounded-[14px] bg-black px-7 text-[17px] font-medium tracking-[-0.01em] text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition hover:bg-[#222] active:scale-[0.97] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-12 select-none rounded-[14px] bg-white/75 px-6 text-[17px] font-medium tracking-[-0.01em] text-foreground shadow-[0_10px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06] backdrop-blur-2xl transition hover:bg-white/90 active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

const PILL =
  "flex h-12 items-center gap-3 rounded-full pl-5 pr-2 text-[15px] shadow-[0_10px_30px_rgba(0,0,0,0.15)] backdrop-blur-2xl backdrop-saturate-150";

// ── loading progress ─────────────────────────────────────────────────────────
//
// HappyOyster reports which step of its machine the session is in (the journey
// lib/view.ts derives from the snapshot) but no percentage, and a Directing
// build can take a couple of minutes. So the bar is an estimate: each step owns
// a slice of it, and within the active step the fill eases toward the end of
// that slice on the step's typical duration — it never reaches the end until
// the model says the step is done, and it never moves backwards.

const STEP_COPY: Record<JourneyStep["key"], string> = {
  connect: "Connecting to Reactor",
  request: "Requesting your world",
  generate: "Building New York",
  stream: "Opening the stream",
};

const STEP_SLICE: Record<JourneyStep["key"], [number, number]> = {
  connect: [0, 0.08],
  request: [0.08, 0.15],
  generate: [0.15, 0.92],
  stream: [0.92, 1],
};

/** Typical seconds per step, for easing within its slice. */
const STEP_TYPICAL_SEC: Record<JourneyStep["key"], number> = {
  connect: 4,
  request: 4,
  generate: 60,
  stream: 6,
};

function LoadingCard({ session }: { session: WorldSession }) {
  const { journey } = session;
  const current =
    journey.find((step) => step.status === "active") ??
    journey.find((step) => step.status === "pending") ??
    journey[journey.length - 1];
  const index = journey.indexOf(current);
  const { elapsedSec, progress } = useJourneyProgress(current.key);

  return (
    <div className="w-[min(400px,calc(100vw-3rem))] rounded-[22px] bg-white/75 px-5 pb-3 pt-4 text-foreground shadow-[0_10px_30px_rgba(0,0,0,0.15)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Spinner />
          <span className="truncate text-[15px] font-medium tracking-[-0.01em]">
            {STEP_COPY[current.key]}
          </span>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
          {formatClock(elapsedSec)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.08]"
      >
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(2, progress * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12px] text-muted-foreground">
          Step {index + 1} of {journey.length}
          {current.key === "generate" && " · usually a minute or two"}
        </span>
        <button
          onClick={session.exit}
          className="-mr-2.5 h-7 shrink-0 rounded-full px-2.5 text-[12px] font-medium text-muted-foreground transition hover:bg-black/[0.06] hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function useJourneyProgress(stepKey: JourneyStep["key"]): {
  elapsedSec: number;
  progress: number;
} {
  const [now, setNow] = useState(() => Date.now());
  const startedAt = useRef(now);
  const step = useRef({ key: stepKey, since: now });
  const high = useRef(0);

  if (step.current.key !== stepKey) step.current = { key: stepKey, since: now };

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const [from, to] = STEP_SLICE[stepKey];
  const inStep = Math.max(0, now - step.current.since) / 1000;
  const eased = Math.min(0.95, 1 - Math.exp(-inStep / STEP_TYPICAL_SEC[stepKey]));
  high.current = Math.max(high.current, from + (to - from) * eased);

  return {
    elapsedSec: Math.floor((now - startedAt.current) / 1000),
    progress: high.current,
  };
}

function formatClock(totalSec: number): string {
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

// Dark glass over the video: the countdown on HappyOyster's granted budget and
// the way out. At zero the travel ends client-side and the world stays ready.
function TravelPill({ session }: { session: WorldSession }) {
  const { client } = session;
  const totalSeconds = client.maxExperienceTimeSec ?? TRAVEL_SECONDS[2];
  const secondsLeft = useTravelTimer(true, totalSeconds, () => {
    void client.endTravelSession().catch(() => {});
  });
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return (
    <div className={`${PILL} bg-black/45 text-white ring-1 ring-white/10`}>
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff453a]" />
      <span
        className={`font-semibold tabular-nums ${
          secondsLeft <= 10 ? "text-[#ff453a]" : ""
        }`}
      >
        {minutes}:{seconds}
      </span>
      <button
        onClick={() => void client.endTravelSession().catch(() => {})}
        className="h-8 rounded-full bg-white/15 px-4 text-[13px] font-medium transition hover:bg-white/25"
      >
        End
      </button>
    </div>
  );
}

function useTravelTimer(
  active: boolean,
  totalSeconds: number,
  onExpire: () => void,
): number {
  const deadline = useRef<number | null>(null);
  const expired = useRef(false);
  const [left, setLeft] = useState(totalSeconds);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!active) {
      deadline.current = null;
      expired.current = false;
      setLeft(totalSeconds);
      return;
    }
    if (!deadline.current) deadline.current = Date.now() + totalSeconds * 1000;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.round((deadline.current! - Date.now()) / 1000),
      );
      setLeft(remaining);
      if (remaining <= 0 && !expired.current) {
        expired.current = true;
        expireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [active, totalSeconds]);

  return left;
}
