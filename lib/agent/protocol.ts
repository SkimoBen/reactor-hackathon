// What travels between the browser and the agent routes besides the decision
// itself. Secret-free, safe on both sides.
//
//   Overrides — the settings panel's edits to a model call (model, system
//               prompt, image detail…), sent with each request. Anything
//               missing or malformed falls back to the server's default.
//   Trace     — what the model was actually given and what it did: the exact
//               instructions and input text, the tools it called, the raw
//               output. Returned next to the decision for the debug panel.

export type ImageDetail = "low" | "high" | "auto";
export type SearchContextSize = "low" | "medium" | "high";

export interface DirectorOverrides {
  model?: string;
  systemPrompt?: string;
  imageDetail?: ImageDetail;
}

export interface ConciergeOverrides {
  model?: string;
  systemPrompt?: string;
  imageDetail?: ImageDetail;
  webSearch?: boolean;
  searchContextSize?: SearchContextSize;
}

export type TraceToolCall =
  | { type: "search"; queries: string[]; sources: string[]; status: string }
  | { type: "open_page"; url: string | null; status: string }
  | { type: "find_in_page"; pattern: string; url: string; status: string }
  | { type: "other"; name: string; detail: string; status: string };

export interface AgentTrace {
  model: string;
  instructions: string;
  /** The text half of the user message; the frame rides alongside it. */
  input: string;
  imageDetail: ImageDetail | null;
  tools: string[];
  toolCalls: TraceToolCall[];
  /** The model's raw output text, before the server acts on it. */
  output: string;
  usage: { input: number; output: number } | null;
}

const IMAGE_DETAILS: readonly ImageDetail[] = ["low", "high", "auto"];
const CONTEXT_SIZES: readonly SearchContextSize[] = ["low", "medium", "high"];

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= max
    ? value
    : undefined;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return options.includes(value as T) ? (value as T) : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function readDirectorOverrides(value: unknown): DirectorOverrides {
  const raw = record(value);
  return {
    model: text(raw.model, 100)?.trim(),
    systemPrompt: text(raw.systemPrompt, 20_000),
    imageDetail: oneOf(raw.imageDetail, IMAGE_DETAILS),
  };
}

export function readConciergeOverrides(value: unknown): ConciergeOverrides {
  const raw = record(value);
  return {
    model: text(raw.model, 100)?.trim(),
    systemPrompt: text(raw.systemPrompt, 20_000),
    imageDetail: oneOf(raw.imageDetail, IMAGE_DETAILS),
    webSearch: typeof raw.webSearch === "boolean" ? raw.webSearch : undefined,
    searchContextSize: oneOf(raw.searchContextSize, CONTEXT_SIZES),
  };
}

/** The last overlay the Concierge opened, so it can tell a fresh request from
 * the same scene re-triggering a shop the user just dismissed. Ages are in
 * seconds, measured in the browser, so server and client clocks never mix. */
export interface LastOverlay {
  title: string;
  url: string;
  openedSecondsAgo: number;
  /** null while the overlay is still open. */
  closedSecondsAgo: number | null;
}

function seconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

export function readLastOverlay(value: unknown): LastOverlay | null {
  const raw = record(value);
  const title = text(raw.title, 500);
  const url = text(raw.url, 2000);
  const openedSecondsAgo = seconds(raw.openedSecondsAgo);
  if (!title || !url || openedSecondsAgo === undefined) return null;
  return {
    title,
    url,
    openedSecondsAgo,
    closedSecondsAgo: seconds(raw.closedSecondsAgo) ?? null,
  };
}

/** The newest instruction sent to the world, from any source, so the Director
 * can let it land before steering again. Age measured in the browser. */
export interface RecentInstruction {
  source: string;
  text: string;
  secondsAgo: number;
}

export function readRecentInstruction(value: unknown): RecentInstruction | null {
  const raw = record(value);
  const source = text(raw.source, 50);
  const content = text(raw.text, 2000);
  const secondsAgo = seconds(raw.secondsAgo);
  if (!source || !content || secondsAgo === undefined) return null;
  return { source, text: content, secondsAgo };
}
