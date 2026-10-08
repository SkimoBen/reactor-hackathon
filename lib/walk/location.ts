// Where the character is on the street map, for the agents.
//
// The Director and Concierge describe "the place" they're grounding the video
// in. That used to be the start frame's corner for the whole walk; the walk
// layer now keeps this up to date as the character turns onto other streets,
// so the Director stops steering them back to Broadway and the Concierge
// knows which block it's on. Module-level, like lib/agent/events.ts, so it
// survives the provider remounting.

let place: string | null = null;

export function setWalkPlace(next: string | null): void {
  place = next;
}

/** "West 27th Street between Broadway and 5th Avenue in Manhattan", or null. */
export function walkPlace(): string | null {
  return place;
}
