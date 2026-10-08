"use client";

import { useState } from "react";
import {
  ClipDownloadButton,
  ClipPlayer,
  RecordingError,
  normalizeJwtSource,
  type Clip,
  type JwtResolver,
} from "@reactor-team/js-sdk";
import { useHappyOyster } from "@reactor-models/happy-oyster/react";
import { Button } from "@/components/ui/button";
import { Panel, SectionLabel } from "./ui";

// "Snap clip" panel.
//
// Captures the last `durationSeconds` of the live travel and pops a modal
// with the SDK's built-in <ClipPlayer> preview and a download button.
//
// Recording is a base-SDK feature, and the typed model packages
// (@reactor-models/happy-oyster, …) do not re-export the recording
// surface, so the clip components come straight from @reactor-team/js-sdk.
//
// <HappyOysterProvider> does not mount the SDK's <ReactorProvider>, so
// `useReactor()` has no store here. Instead we drive recording through the
// model itself — HappyOysterModel extends `Reactor`, so it has
// `requestClip()` and `getJwtResolver()` — and thread the resolver into
// <ClipPlayer> / <ClipDownloadButton> explicitly.
//
// The panel gates itself on `streaming`, so it can sit in the rail
// unconditionally: it appears once a travel is streaming and disappears
// when the session ends. Clip URLs are short-lived (a few minutes) — the
// downloaded MP4 is the artifact, not the URL.
export interface SnapClipProps {
  /** Length of the snap, in seconds. Default 10. */
  durationSeconds?: number;
}

interface Snap {
  clip: Clip;
  getJwt?: JwtResolver;
}

export function SnapClip({ durationSeconds = 10 }: SnapClipProps) {
  const { model, streaming } = useHappyOyster();

  const [snapped, setSnapped] = useState<Snap | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!streaming) return null;

  async function snap() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const clip = await model.requestClip(durationSeconds);
      const jwt = model.getJwtResolver();
      setSnapped({ clip, getJwt: jwt ? normalizeJwtSource(jwt) : undefined });
    } catch (cause) {
      setError(
        cause instanceof RecordingError
          ? `${cause.code}: ${cause.reason}`
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <SectionLabel>Capture</SectionLabel>
      <Button variant="secondary" onClick={snap} disabled={busy}>
        {busy ? "Capturing…" : `Snap last ${durationSeconds}s`}
      </Button>
      {error && (
        <p className="break-words text-[13px] leading-snug text-destructive">
          {error}
        </p>
      )}
      {snapped && (
        <ClipModal
          clip={snapped.clip}
          getJwt={snapped.getJwt}
          onClose={() => setSnapped(null)}
          onError={(cause) => setError(cause.message)}
          onDownloaded={() => setError(null)}
        />
      )}
    </Panel>
  );
}

function ClipModal({
  clip,
  getJwt,
  onClose,
  onError,
  onDownloaded,
}: {
  clip: Clip;
  getJwt?: JwtResolver;
  onClose: () => void;
  onError: (error: Error) => void;
  onDownloaded: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-md"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-2xl flex-col gap-4 rounded-[22px] bg-card p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Your clip</SectionLabel>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <ClipPlayer
          clip={clip}
          getJwt={getJwt}
          onError={onError}
          className="w-full overflow-hidden rounded-xl bg-black"
        />

        <div className="flex justify-end">
          <ClipDownloadButton
            clip={clip}
            getJwt={getJwt}
            filename={`happy-oyster-clip-${Math.floor(Date.now() / 1000)}.mp4`}
            onSuccess={onDownloaded}
            onError={onError}
          />
        </div>
      </div>
    </div>
  );
}
