"use client";

// The fixed shell: header on top, control sidebar beside the content screen —
// the layout every Reactor example uses, and it never changes shape. Nothing
// here navigates or goes full screen: useWorldSession() reduces the SDK's
// authoritative snapshot to one AppView (lib/view.ts) and the two regions
// switch what they show off it, so the page always mirrors the session's
// state machine.
//
// The experience mode is fixed for the life of a session (each mode is its own
// Reactor model), so the pending intent — and the mode it implies — is owned
// here, above the provider, and the provider is keyed on the mode: picking a
// world of the other experience remounts a fresh session. Nothing connects
// until you hit Connect or pick a world.
//
// The composer's draft lives here for the same reason: it has to outlive both
// the sidebar's view switch (the composer unmounts while a build runs) and the
// mode remount, so a failed build hands you back the prompt you typed. The
// system prompt is held here too, and folded into every create intent as it
// runs, so every world the composer builds carries it.

import { useCallback, useState } from "react";
import type { HappyOysterMode } from "@reactor-models/happy-oyster";
import type { WorldIntent } from "@/lib/worlds";
import { Header } from "@/components/Header";
import { LiveClientProvider } from "@/components/happy-oyster/ho-client";
import { useWorldSession } from "@/components/happy-oyster/use-world-session";
import { Sidebar } from "@/components/happy-oyster/Sidebar";
import {
  EMPTY_COMPOSE_DRAFT,
  type ComposeDraft,
} from "@/components/happy-oyster/Composer";
import { Screen } from "@/components/happy-oyster/Screen";
import {
  useSystemPrompt,
  withSystemPrompt,
} from "@/components/happy-oyster/SystemPrompt";
import { AgentRuntime } from "@/components/agent/AgentRuntime";

export function HappyOysterApp() {
  const [mode, setMode] = useState<HappyOysterMode>("adventure");
  const [intent, setIntent] = useState<WorldIntent | null>(null);
  const [composeDraft, setComposeDraft] =
    useState<ComposeDraft>(EMPTY_COMPOSE_DRAFT);
  const patchComposeDraft = useCallback(
    (patch: Partial<ComposeDraft>) =>
      setComposeDraft((draft) => ({ ...draft, ...patch })),
    [],
  );
  const [systemPrompt, setSystemPrompt] = useSystemPrompt();

  // A new intent sets both the mode (which model to connect to) and the intent.
  // Leaving an intent keeps the mode, so returning to the same experience
  // reuses the session instead of remounting it.
  const run = useCallback(
    (next: WorldIntent) => {
      setMode(next.mode);
      setIntent(
        next.kind === "create"
          ? {
              ...next,
              params: {
                ...next.params,
                prompt: withSystemPrompt(next.params.prompt, systemPrompt),
              },
            }
          : next,
      );
    },
    [systemPrompt],
  );
  const clearIntent = useCallback(() => setIntent(null), []);

  return (
    <LiveClientProvider mode={mode} key={mode}>
      <Shell
        intent={intent}
        onRun={run}
        onClearIntent={clearIntent}
        composeDraft={composeDraft}
        onComposeDraftChange={patchComposeDraft}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
      />
    </LiveClientProvider>
  );
}

function Shell({
  intent,
  onRun,
  onClearIntent,
  composeDraft,
  onComposeDraftChange,
  systemPrompt,
  onSystemPromptChange,
}: {
  intent: WorldIntent | null;
  onRun: (intent: WorldIntent) => void;
  onClearIntent: () => void;
  composeDraft: ComposeDraft;
  onComposeDraftChange: (patch: Partial<ComposeDraft>) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
}) {
  const session = useWorldSession({ intent, onRun, onClearIntent });
  return (
    <div className="flex h-dvh flex-col bg-background">
      <Header />
      <main className="flex w-full min-h-0 flex-1 flex-col gap-5 p-4 max-lg:overflow-y-auto sm:p-6 lg:flex-row lg:gap-6 lg:p-8">
        <Sidebar
          session={session}
          composeDraft={composeDraft}
          onComposeDraftChange={onComposeDraftChange}
          systemPrompt={systemPrompt}
          onSystemPromptChange={onSystemPromptChange}
        />
        <Screen session={session} />
      </main>
      {/* The Director/Concierge agents: a floating console plus the overlay
          the Concierge opens. Inside the provider so it can steer the world. */}
      <AgentRuntime session={session} />
    </div>
  );
}
