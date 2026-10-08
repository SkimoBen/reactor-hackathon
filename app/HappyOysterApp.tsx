"use client";

// The shell: one stage, nothing else. There are no model controls — the world
// (a Directing world opening on Broadway, lib/agent/config.ts START_SCENE) and
// every creation knob are preset, so the only thing the page offers is
// "Explore New York". useWorldSession() reduces the SDK's authoritative
// snapshot to one AppView (lib/view.ts) and the stage switches what it shows
// off it, so the page always mirrors the session's state machine.
//
// While exploring, the user holds space to talk (use-speech.ts → the
// Concierge) and the Director watches the stream; the transcript panel in the
// stage's corner shows both, with any shop the Concierge opens docked under
// it. The intent lives here, above the provider, so the session hook
// can drive it; nothing connects until Explore is pressed.

import { useCallback, useState } from "react";
import type { WorldIntent } from "@/lib/worlds";
import { loadStartSceneIntent } from "@/lib/agent/start-scene";
import { LiveClientProvider } from "@/components/happy-oyster/ho-client";
import { useWorldSession } from "@/components/happy-oyster/use-world-session";
import { Stage } from "@/components/happy-oyster/Stage";
import { useAgentRuntime } from "@/components/agent/use-agent-runtime";
import { useSpeech } from "@/components/agent/use-speech";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { AgentOverlay } from "@/components/agent/AgentOverlay";

export function HappyOysterApp() {
  const [intent, setIntent] = useState<WorldIntent | null>(null);
  const clearIntent = useCallback(() => setIntent(null), []);
  return (
    <LiveClientProvider mode="directing">
      <Shell intent={intent} onRun={setIntent} onClearIntent={clearIntent} />
    </LiveClientProvider>
  );
}

function Shell({
  intent,
  onRun,
  onClearIntent,
}: {
  intent: WorldIntent | null;
  onRun: (intent: WorldIntent) => void;
  onClearIntent: () => void;
}) {
  const session = useWorldSession({ intent, onRun, onClearIntent });
  const agents = useAgentRuntime(session);
  // Push-to-talk is live whenever a world is up; back on the landing view
  // (Done, Cancel, or a dropped session) the hook stops listening.
  const speech = useSpeech(agents.say, session.view.kind !== "browse");
  const [preparing, setPreparing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const explore = useCallback(async () => {
    // Inside the click, so the browser can ask for the microphone now rather
    // than on the first press of space.
    speech.prime();
    setStartError(null);
    setPreparing(true);
    try {
      session.run(await loadStartSceneIntent());
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreparing(false);
    }
  }, [speech, session]);

  return (
    <div className="h-dvh bg-white p-3 sm:p-6 lg:p-10">
      <Stage
        session={session}
        onExplore={() => void explore()}
        preparing={preparing}
        startError={startError}
      >
        <AgentPanel
          events={agents.events}
          speech={speech}
          busy={agents.busy}
          error={agents.error}
          pending={agents.pending}
          onCancelPending={agents.cancelPending}
          onSay={agents.say}
          overlay={
            agents.overlay && (
              <AgentOverlay
                target={agents.overlay}
                shopper={agents.shopper}
                onClose={agents.closeOverlay}
              />
            )
          }
        />
      </Stage>
    </div>
  );
}
