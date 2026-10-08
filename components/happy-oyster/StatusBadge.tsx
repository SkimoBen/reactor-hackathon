"use client";

import { Button } from "@/components/ui/button";
import { useHappyOysterClient } from "./ho-client";
import { Panel } from "./ui";

// The connection badge every Reactor example carries at the top of its
// sidebar: a visible session state plus an explicit Connect/Disconnect,
// so the disconnected → connecting → connected transitions are seen,
// not hidden behind a spinner.
//
// Connecting here is optional — picking a world connects automatically —
// but pre-connecting takes the session handshake out of the build wait.
const TONE: Record<string, { dot: string; label: string }> = {
  idle: { dot: "bg-tertiary/50", label: "Disconnected" },
  connecting: { dot: "bg-warning animate-pulse", label: "Connecting…" },
  connected: { dot: "bg-success", label: "Connected" },
  ended: { dot: "bg-tertiary/50", label: "Disconnected" },
  failed: { dot: "bg-destructive", label: "Connection failed" },
};

export function StatusBadge({
  onDisconnect,
}: {
  /** Override the plain disconnect, e.g. to also drop the pending intent. */
  onDisconnect?: () => void;
}) {
  const { phase, lastError, connect, disconnect } = useHappyOysterClient();
  const tone = TONE[phase] ?? TONE.connected; // streaming phases read as connected
  const idle = phase === "idle" || phase === "ended" || phase === "failed";

  return (
    <Panel className="gap-2 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          <span className="text-[15px] font-medium text-foreground">
            {tone.label}
          </span>
        </div>
        {idle ? (
          <Button size="sm" onClick={() => void connect().catch(() => {})}>
            Connect
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onDisconnect ? onDisconnect() : void disconnect().catch(() => {})
            }
          >
            Disconnect
          </Button>
        )}
      </div>
      {lastError && (
        <p className="break-words text-[13px] leading-snug text-destructive">
          {lastError}
        </p>
      )}
    </Panel>
  );
}
