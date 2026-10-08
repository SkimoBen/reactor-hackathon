// Shared, secret-free agent settings. Safe to import from the browser.
//
// The agents' model ids and the OpenAI key live in lib/agent/openai.ts, which
// is server-only. Everything here is demo wiring: where the user "is", what
// the world opens on, and how often the Director looks at the stream.

/** The user's real-world address, for the Concierge's "nearest shop" lookups.
 * Hardcoded to Google's New York office for the demo. */
export const USER_LOCATION = {
  address: "111 8th Ave, New York, NY 10011 (Google NYC)",
  country: "US",
  city: "New York",
  region: "NY",
  timezone: "America/New_York",
} as const;

/** The world every run opens on: a real photo of Broadway's pedestrian plaza
 * in NoMad, served from /public (centre-cropped to 16:9 — HappyOyster needs a
 * 1.5–2.0 aspect ratio and the original is a hair under). In Directing mode
 * the image is used verbatim as the first frame, so the stream literally
 * starts on the photo and the prompt below has to describe exactly that. */
export const START_SCENE = {
  imagePath: "/start-frame.jpeg",
  place: "Broadway pedestrian plaza at West 26th Street, NoMad / Flatiron, Manhattan",
  title: "Broadway, NoMad",
  prompt: [
    "You are walking north up Broadway through the NoMad pedestrian plaza at West 26th Street in Manhattan on an overcast summer afternoon.",
    "The camera follows you from behind at eye level in third person — one continuous take, no cuts, drifting slowly forward as you walk.",
    "Around you: a car-free stretch of Broadway painted grey with white crosswalk stripes and a green bike lane, granite blocks and white bollards at the edges, and big concrete planters overflowing with pink and purple flowers.",
    "Café tables with orange and red umbrellas fill the plaza where people eat lunch; a cyclist rolls past; pedestrians in summer clothes cross carrying shopping bags.",
    "On both sides rise cast-iron and limestone loft buildings with ground-floor shops — a gelato café with a sidewalk menu board, a green-awning storefront, a LinkNYC kiosk, a Do Not Enter / Except Bikes sign on a traffic pole.",
    "Ahead, the vertical Broadway Plaza Hotel sign and a painted Hudson Realty wall ad, with glass skyscrapers fading into haze far up the avenue.",
    "Soft diffuse light, muted colours, a light wind stirring the planters. The storefronts have real doors: you can walk through them into their interiors.",
  ].join(" "),
} as const;

/** How often the Director looks at the stream while a travel is live. */
export const DIRECTOR_INTERVAL_MS = 10_000;

/** Width of the JPEG frame sent to the agents — small keeps vision cheap. */
export const SCREENSHOT_WIDTH = 640;

/** How many recent events ride along with each agent call. */
export const EVENT_WINDOW = 20;
