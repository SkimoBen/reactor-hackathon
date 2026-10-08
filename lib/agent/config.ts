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
  // Laid out the way Alibaba's HappyOyster prompt guide recommends for
  // Directing worlds (world, character, style, scene, locks, shot plan,
  // negatives). The server writes its own story script from this, so the
  // world says "no plot" and the shot plan keeps it a slow stroll. The lead
  // is the backpacker already walking away from camera in the photo, so the
  // follow camera has someone real to hold on to. Must stay ≤ 2000 chars.
  prompt: [
    "WORLD: Summer, Manhattan. A photorealistic walk north up Broadway through the NoMad pedestrian plaza at West 26th Street. Slice of life, no plot: a hungry young man on his lunch break browsing the storefronts for something to eat.",
    "CHARACTER: The lead is the man walking away from camera in the first frame, seen only from behind: twenties, slim, short dark hair, plain white T-shirt, black backpack, khaki chinos, white sneakers. He never turns to face the camera and never speaks.",
    "STYLE: 4K New York walking-tour footage shot on a gimbal; natural, slightly muted grade; soft overcast daylight.",
    "SCENE: Car-free Broadway: grey asphalt with white crosswalk stripes, a green bike lane lined with white bollards, granite blocks, big planters of pink and purple flowers, café tables under orange and red umbrellas. Both sides: cast-iron and limestone loft buildings with ground-floor shops — a pizza-by-the-slice counter, a gelato café with a sidewalk menu board, a coffee bar, a green-awning storefront, a LinkNYC kiosk. Ahead: the vertical Broadway Plaza Hotel sign, glass towers in the haze. Every shop has a real glass door and a believable New York interior (pizza counter with whole pies under glass, gelato case, espresso bar). Sound: traffic hum, bike bells, passing chatter.",
    "LOCKS: Third-person follow camera at eye level a few metres behind him, one continuous take, no cuts. His clothes and backpack never change. At most three people near the camera; everyone else stays in the background.",
    "SHOT PLAN: Open exactly on the first frame, then he crosses the crosswalk and walks north. 0:10–1:00 he passes the café tables and planters. 1:00–3:00 he strolls slowly past the storefronts, glancing into windows. He enters a shop only when instructed, and stays inside until told to leave.",
    "NEGATIVE: no fantasy, sci-fi or surreal elements; no change of city, weather or time of day; no cars on the plaza; no music, narration or on-screen text; no sudden events.",
  ].join("\n"),
} as const;

/** How often the Director looks at the stream while a travel is live. */
export const DIRECTOR_INTERVAL_MS = 10_000;

/** After any instruction reaches the world, the Director sits out this long
 * so the instruction can land before it judges (and steers) again. */
export const DIRECTOR_COOLDOWN_MS = 15_000;

/** While an overlay waits for the scene to catch up (the world model renders
 * an instruction seconds after it's sent), how often a frame is checked… */
export const CONCIERGE_WAIT_INTERVAL_MS = 3_000;

/** …and how long to wait before opening it anyway. */
export const CONCIERGE_WAIT_TIMEOUT_MS = 60_000;

/** Width of the JPEG frame sent to the agents — small keeps vision cheap. */
export const SCREENSHOT_WIDTH = 640;

/** How many recent events ride along with each agent call. */
export const EVENT_WINDOW = 20;
