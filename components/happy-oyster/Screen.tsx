"use client";

// The content screen — the app's fixed sandbox, reserved for the world:
// every view renders into the same frame the travel video plays in (the
// generated first frame lives in the sidebar), and the live world stream
// plays on top. Idle, it carries the page's hero.

import type { ReactNode } from "react";
import type { JourneyStep } from "@/lib/view";
import { useVideoSlot } from "./ho-client";
import type { WorldSession } from "./use-world-session";
import { Eyebrow, Spinner, WorldIdChip } from "./ui";

export function Screen({ session }: { session: WorldSession }) {
  const { view } = session;
  const videoSlot = useVideoSlot();

  // Loading spans every state between "picked a world" and "video is up";
  // the journey pane tracks the API's own machine through all of them.
  const loading =
    view.kind === "connecting" ||
    view.kind === "building" ||
    (view.kind === "traveling" && !view.live);

  // A white card like the sidebar's; it only goes black once a travel is
  // streaming into it, so the video gets a cinema frame.
  const theater = view.kind === "traveling";

  return (
    <section
      className={`relative order-1 aspect-video w-full shrink-0 overflow-hidden rounded-[22px] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.06)] transition-colors duration-500 lg:order-2 lg:aspect-auto lg:min-h-0 lg:min-w-0 lg:flex-1 ${
        theater ? "bg-black" : "bg-card"
      }`}
    >
      {view.kind === "browse" && <Hero />}
      {view.kind === "traveling" && videoSlot}
      {loading && <JourneyPane session={session} />}
      {view.kind === "ready" && <EndScene session={session} />}
      {view.kind === "error" && (
        <Overlay>
          <Eyebrow>
            {view.buildFailed ? "World build failed" : "Something broke"}
          </Eyebrow>
          <p className="max-w-md break-words px-6 text-[15px] leading-[1.45] text-destructive">
            {view.message}
          </p>
        </Overlay>
      )}
    </section>
  );
}

// ── the idle hero ────────────────────────────────────────────────────────────

function Hero() {
  return (
    <Overlay>
      <div className="flex flex-col items-center gap-3 px-6 sm:gap-4">
        <h2 className="text-[28px] font-semibold leading-[1.07] tracking-[-0.028em] text-foreground sm:text-[44px] xl:text-[56px]">
          Imagine a world.
          <br />
          <span className="bg-gradient-to-r from-[#0071e3] via-[#8e44ec] to-[#ff5f45] bg-clip-text text-transparent">
            Then step inside.
          </span>
        </h2>
        <p className="hidden max-w-md text-[17px] leading-[1.45] text-muted-foreground sm:block xl:text-[19px]">
          Describe a place and HappyOyster builds it live. Walk it with WASD in
          Adventure, or direct its story with words.
        </p>
      </div>
    </Overlay>
  );
}

// ── the loading journey ──────────────────────────────────────────────────────

// Not a spinner: the API's own machine, live. Each row is one step of the
// journey lib/view.ts derives from the session snapshot.
function JourneyPane({ session }: { session: WorldSession }) {
  const { journey } = session;
  return (
    <Overlay>
      <div className="flex w-full max-w-sm flex-col gap-3 px-6">
        {journey.map((step) => (
          <JourneyRow key={step.key} step={step} />
        ))}
      </div>
    </Overlay>
  );
}

function JourneyRow({ step }: { step: JourneyStep }) {
  return (
    <div className="flex items-center gap-3 text-left">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {step.status === "done" ? (
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4 text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 8.5 6.5 12 13 4.5" />
          </svg>
        ) : step.status === "active" ? (
          <Spinner />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
        )}
      </span>
      <span
        className={`text-[15px] ${
          step.status === "active"
            ? "font-medium text-foreground"
            : step.status === "done"
              ? "text-muted-foreground"
              : "text-tertiary/70"
        }`}
      >
        {step.label}
      </span>
    </div>
  );
}

// ── the end scene ────────────────────────────────────────────────────────────

// Shown when a travel ends: the world outlives it. Its encrypted_world_id is
// a capability — save it and attach it anytime to skip the build.
function EndScene({ session }: { session: WorldSession }) {
  const worldId = session.client.worldState?.encrypted_world_id;
  return (
    <Overlay>
      <Eyebrow>Travel ended</Eyebrow>
      {session.intent && (
        <span className="text-[32px] font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-[40px]">
          {session.intent.title}
        </span>
      )}
      <p className="max-w-sm px-6 text-[17px] leading-[1.45] text-muted-foreground">
        This world is permanent. Save its id and attach it anytime to jump
        straight back in — no build wait.
      </p>
      {worldId && <WorldIdChip worldId={worldId} />}
    </Overlay>
  );
}

// ── shared layers ────────────────────────────────────────────────────────────

// Frosted white, so the same overlay reads on the idle card and over a
// stream that hasn't started yet.
function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card/90 text-center backdrop-blur-xl">
      {children}
    </div>
  );
}
