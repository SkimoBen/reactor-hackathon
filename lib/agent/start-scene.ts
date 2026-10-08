"use client";

import { START_SCENE } from "./config";
import { getSettings } from "./settings";
import type { WorldIntent } from "@/lib/worlds";

// The one way in: a Directing world that opens on the real Broadway photo
// (START_SCENE). In Directing mode the first-frame image is used verbatim, so
// the stream literally starts on the photo and the Director has something real
// to hold it to. The file is fetched from /public and handed to createWorld
// like a user upload. The prompt, resolution, layout and narrative come from
// the debug panel's settings (defaults: START_SCENE.prompt, 480p, Stable).
export async function loadStartSceneIntent(): Promise<WorldIntent> {
  const { world } = getSettings();
  const res = await fetch(START_SCENE.imagePath);
  if (!res.ok) throw new Error(`Could not load ${START_SCENE.imagePath}`);
  const blob = await res.blob();
  const firstFrameImage = new File([blob], "start-frame.jpeg", {
    type: "image/jpeg",
  });
  return {
    kind: "create",
    mode: "directing",
    title: START_SCENE.title,
    params: {
      prompt: world.prompt.trim() || START_SCENE.prompt,
      firstFrameImage,
      resolution: world.resolution,
      layout: world.layout,
      ...(world.narrative !== "default" && { narrative: world.narrative }),
    },
  };
}
