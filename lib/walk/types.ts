// Shapes shared by the walk's API routes (app/api/walk/*) and the client.

import type { Side } from "./streets";

export interface Store {
  name: string;
  /** Google Maps link for the place. */
  uri: string | null;
}

/** One block's storefront businesses, by named side of the street. */
export type Directory = Partial<Record<Side, Store[]>>;

export interface StorefrontLabel {
  name: string;
  side: "left" | "right";
  /** [ymin, xmin, ymax, xmax] on the frame, normalised to 0–1000. */
  box: [number, number, number, number];
}
