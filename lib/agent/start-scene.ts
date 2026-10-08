"use client";

import { START_SCENE } from "./config";
import type { WorldIntent } from "@/lib/worlds";

// The one way in: a Directing world that opens on the real Broadway photo
// (START_SCENE). In Directing mode the first-frame image is used verbatim, so
// the stream literally starts on the photo and the Director has something real
// to hold it to. The file is fetched from /public and handed to createWorld
// like a user upload. Every knob is preset here; the UI exposes none of them.
export async function loadStartSceneIntent(): Promise<WorldIntent> {
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
      prompt: START_SCENE.prompt,
      firstFrameImage,
      resolution: "720p",
      layout: "Stable",
    },
  };
}
