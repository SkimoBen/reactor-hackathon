"use client";

// Grab the current frame of the live world as a small JPEG data URL.
//
// The world video is a WebRTC MediaStream on the <video>'s srcObject (not a
// cross-origin URL), so drawing it to a canvas does not taint the canvas and
// toDataURL works. ho-client.tsx tags the element with data-ho-video so this
// doesn't need a ref threaded through the SDK's component.

import { SCREENSHOT_WIDTH } from "./config";

let canvas: HTMLCanvasElement | null = null;

export function captureFrame(width = SCREENSHOT_WIDTH): string | null {
  if (typeof document === "undefined") return null;
  const video = document.querySelector<HTMLVideoElement>("video[data-ho-video]");
  // readyState 2 = HAVE_CURRENT_DATA: there is a frame to draw.
  if (!video || video.readyState < 2 || !video.videoWidth) return null;

  canvas ??= document.createElement("canvas");
  const scale = width / video.videoWidth;
  canvas.width = width;
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
