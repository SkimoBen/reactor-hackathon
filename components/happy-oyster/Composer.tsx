"use client";

// The sidebar's ways in while browsing:
//   • a custom prompt — compose your own world, choose Adventure or Directing;
//   • an existing world id — attach a world you built earlier (instant).
// Both resolve to a WorldIntent the session then runs.

import { useState } from "react";
import { MAX_FIRST_FRAME_IMAGE_BYTES } from "@reactor-models/happy-oyster";
import type { WorldIntent } from "@/lib/worlds";
import { Button } from "@/components/ui/button";
import { FIELD, Hint, Panel, SectionLabel, Segmented } from "./ui";

// Everything the composer has typed. It lives above the sidebar's view switch
// (in HappyOysterApp) rather than in this component: the composer only mounts
// while browsing, so if a build fails and you come back, local state would
// have been thrown away with the unmount — and the prompt with it.
//
// Mode-specific creation knobs: perspective/resolution carry the model's
// documented defaults, so they always ride the payload harmlessly; layout and
// narrative have no server default, so "auto" means omit and let the model
// choose (matching a build that never set them).
export interface ComposeDraft {
  prompt: string;
  mode: 1 | 2;
  imageFile: File | null;
  perspective: "third_person" | "first_person";
  resolution: "720p" | "480p";
  layout: "auto" | "Stable" | "Fast";
  narrative: "auto" | "Normal" | "Calm" | "Dramatic";
}

export const EMPTY_COMPOSE_DRAFT: ComposeDraft = {
  prompt: "",
  mode: 1,
  imageFile: null,
  perspective: "third_person",
  resolution: "720p",
  layout: "auto",
  narrative: "auto",
};

export function CustomCompose({
  draft,
  onDraftChange,
  maxPromptLength,
  onIntent,
}: {
  draft: ComposeDraft;
  onDraftChange: (patch: Partial<ComposeDraft>) => void;
  /** What's left of the model's prompt cap after the system prompt. */
  maxPromptLength: number;
  onIntent: (intent: WorldIntent) => void;
}) {
  const { prompt, mode, imageFile, perspective, resolution, layout, narrative } =
    draft;
  const setPrompt = (prompt: string) => onDraftChange({ prompt });
  const setMode = (mode: 1 | 2) => onDraftChange({ mode });
  const setImageFile = (imageFile: File | null) => onDraftChange({ imageFile });
  const setPerspective = (perspective: ComposeDraft["perspective"]) =>
    onDraftChange({ perspective });
  const setResolution = (resolution: ComposeDraft["resolution"]) =>
    onDraftChange({ resolution });
  const setLayout = (layout: ComposeDraft["layout"]) => onDraftChange({ layout });
  const setNarrative = (narrative: ComposeDraft["narrative"]) =>
    onDraftChange({ narrative });
  // Transient: an over-limit pick is worth a message, not worth remembering.
  const [imageError, setImageError] = useState<string | null>(null);

  const build = () => {
    const text = prompt.trim();
    if (!text) return;
    const firstFrameImage = imageFile ?? undefined;
    onIntent({
      kind: "create",
      mode: mode === 2 ? "directing" : "adventure",
      title: "Your world",
      params:
        mode === 2
          ? {
              prompt: text,
              firstFrameImage,
              resolution,
              ...(layout !== "auto" ? { layout } : {}),
              ...(narrative !== "auto" ? { narrative } : {}),
            }
          : { prompt: text, firstFrameImage, perspective },
    });
  };

  return (
    <Panel className="gap-4">
      <SectionLabel>Create a world</SectionLabel>
      <Segmented
        value={mode}
        onChange={setMode}
        options={MODE_OPTIONS}
      />
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={4}
        maxLength={maxPromptLength}
        placeholder="Describe a world… a paragraph with explicit setting, mood, and camera framing works best."
        className={`${FIELD} resize-none`}
      />
      {imageFile ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3.5 py-2.5">
          <span className="min-w-0 truncate text-[13px] text-foreground">
            {imageFile.name}
          </span>
          <button
            onClick={() => setImageFile(null)}
            className="shrink-0 text-[13px] text-primary transition hover:underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3.5 py-2.5 text-[13px] text-muted-foreground transition hover:border-primary hover:text-primary">
          <span aria-hidden className="text-[15px] leading-none">+</span>
          Add a first-frame image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              if (!file) return;
              if (file.size > MAX_FIRST_FRAME_IMAGE_BYTES) {
                setImageError("That image is over the 2MB limit.");
                return;
              }
              setImageError(null);
              setImageFile(file);
            }}
          />
        </label>
      )}
      {imageError && (
        <p className="text-[12px] text-destructive">{imageError}</p>
      )}
      {mode === 1 ? (
        <OptionGroup
          label="Perspective"
          value={perspective}
          onChange={(value) => setPerspective(value)}
          options={[
            { value: "third_person", label: "Third-person" },
            { value: "first_person", label: "First-person" },
          ]}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <OptionGroup
            label="Resolution"
            value={resolution}
            onChange={(value) => setResolution(value)}
            options={[
              { value: "720p", label: "720p" },
              { value: "480p", label: "480p" },
            ]}
          />
          <OptionGroup
            label="Camera motion"
            value={layout}
            onChange={(value) => setLayout(value)}
            options={[
              { value: "auto", label: "Auto" },
              { value: "Stable", label: "Stable" },
              { value: "Fast", label: "Fast" },
            ]}
          />
          <OptionGroup
            label="Narrative"
            value={narrative}
            onChange={(value) => setNarrative(value)}
            options={[
              { value: "auto", label: "Auto" },
              { value: "Normal", label: "Normal" },
              { value: "Calm", label: "Calm" },
              { value: "Dramatic", label: "Dramatic" },
            ]}
          />
        </div>
      )}
      <Hint>
        {mode === 1
          ? "Adventure worlds are playable, you drive them with WASD."
          : "Directing worlds are steered with text instructions and transport."}
      </Hint>
      <Button onClick={build} disabled={prompt.trim().length === 0}>
        Build world
      </Button>
    </Panel>
  );
}

export function AttachById({
  onIntent,
}: {
  onIntent: (intent: WorldIntent) => void;
}) {
  const [id, setId] = useState("");
  // A world only attaches through its own experience's model, so the attach
  // has to connect to the matching mode — pick it here.
  const [mode, setMode] = useState<1 | 2>(1);
  return (
    <Panel>
      <SectionLabel>Return to a world</SectionLabel>
      <Hint>
        Worlds are permanent. Paste an id you saved from an earlier build to
        jump straight back in, no build wait — and pick the experience it
        belongs to.
      </Hint>
      <Segmented value={mode} onChange={setMode} options={MODE_OPTIONS} />
      <div className="flex gap-2">
        <input
          value={id}
          onChange={(event) => setId(event.target.value)}
          placeholder="encrypted_world_id"
          className={`${FIELD} min-w-0 flex-1 font-mono text-[13px]`}
        />
        <Button
          variant="secondary"
          className="h-auto"
          onClick={() =>
            onIntent({
              kind: "attach",
              mode: mode === 2 ? "directing" : "adventure",
              encryptedWorldId: id.trim(),
              title: "Attached world",
            })
          }
          disabled={id.trim().length === 0}
        >
          Attach
        </Button>
      </div>
    </Panel>
  );
}

const MODE_OPTIONS: { value: 1 | 2; label: string }[] = [
  { value: 1, label: "Adventure" },
  { value: 2, label: "Directing" },
];

// A labelled segmented control for one creation knob. Kept generic over the
// option value so each caller stays typed to its own enum.
function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted-foreground">
        {label}
      </span>
      <Segmented value={value} onChange={onChange} options={options} />
    </div>
  );
}
