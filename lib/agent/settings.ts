"use client";

// The agents' tunable settings, and the HappyOyster world they start from,
// edited from the debug panel's Settings tab.
//
// Module-level like the event log, so it outlives the keyed live provider,
// and persisted to localStorage — but only the fields that differ from the
// defaults, so a later change to a default prompt in code still reaches
// anyone who never edited that field. An empty model means "the server's
// default" (GET /api/agent/settings says which that is).

import { useSyncExternalStore } from "react";
import {
  CONCIERGE_WAIT_INTERVAL_MS,
  CONCIERGE_WAIT_TIMEOUT_MS,
  DIRECTOR_COOLDOWN_MS,
  DIRECTOR_INTERVAL_MS,
  EVENT_WINDOW,
  SCREENSHOT_WIDTH,
  START_SCENE,
} from "./config";
import { CONCIERGE_SYSTEM, DIRECTOR_SYSTEM } from "./prompts";
import type {
  ConciergeOverrides,
  DirectorOverrides,
  ImageDetail,
  SearchContextSize,
} from "./protocol";

export interface AgentSettings {
  /** What "Explore" creates (lib/agent/start-scene.ts); read at start time. */
  world: {
    prompt: string;
    resolution: "480p" | "720p";
    layout: "Stable" | "Fast";
    /** "default" leaves it to HappyOyster. */
    narrative: "default" | "Calm" | "Normal" | "Dramatic";
  };
  director: {
    enabled: boolean;
    model: string;
    systemPrompt: string;
    intervalMs: number;
    /** Skip ticks for this long after any instruction reaches the world. */
    cooldownMs: number;
    imageDetail: ImageDetail;
  };
  concierge: {
    model: string;
    systemPrompt: string;
    webSearch: boolean;
    searchContextSize: SearchContextSize;
    imageDetail: ImageDetail;
    /** How often a held overlay checks the frame for its moment. */
    waitIntervalMs: number;
    /** Open a held overlay anyway after this long. */
    waitTimeoutMs: number;
  };
  /** Width of the JPEG frame sent to both agents. */
  screenshotWidth: number;
  /** How many recent log lines ride along with each call. */
  eventWindow: number;
}

export const DEFAULT_SETTINGS: AgentSettings = {
  world: {
    prompt: START_SCENE.prompt,
    resolution: "480p",
    layout: "Stable",
    // Calm: few events, atmosphere over drama — a stroll, not a story.
    narrative: "Calm",
  },
  director: {
    enabled: true,
    model: "",
    systemPrompt: DIRECTOR_SYSTEM,
    intervalMs: DIRECTOR_INTERVAL_MS,
    cooldownMs: DIRECTOR_COOLDOWN_MS,
    imageDetail: "low",
  },
  concierge: {
    model: "",
    systemPrompt: CONCIERGE_SYSTEM,
    webSearch: true,
    // Low: one quick search for "a" match beats a thorough one for the best.
    searchContextSize: "low",
    imageDetail: "low",
    waitIntervalMs: CONCIERGE_WAIT_INTERVAL_MS,
    waitTimeoutMs: CONCIERGE_WAIT_TIMEOUT_MS,
  },
  screenshotWidth: SCREENSHOT_WIDTH,
  eventWindow: EVENT_WINDOW,
};

const STORAGE_KEY = "ho-agent-settings";

type Section = "world" | "director" | "concierge";

let settings: AgentSettings = load();
const listeners = new Set<() => void>();

function load(): AgentSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      world: { ...DEFAULT_SETTINGS.world, ...stored.world },
      director: { ...DEFAULT_SETTINGS.director, ...stored.director },
      concierge: { ...DEFAULT_SETTINGS.concierge, ...stored.concierge },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function changedFields<T extends object>(value: T, defaults: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, field]) => field !== defaults[key as keyof T],
    ),
  ) as Partial<T>;
}

function save() {
  const { world, director, concierge, ...rest } = settings;
  const { world: w, director: d, concierge: c, ...restDefaults } = DEFAULT_SETTINGS;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...changedFields(rest, restDefaults),
        world: changedFields(world, w),
        director: changedFields(director, d),
        concierge: changedFields(concierge, c),
      }),
    );
  } catch {
    // Private mode or blocked storage: the edit still applies this session.
  }
}

function set(next: AgentSettings) {
  settings = next;
  save();
  for (const listener of listeners) listener();
}

export function getSettings(): AgentSettings {
  return settings;
}

export function updateSettings(patch: Partial<Omit<AgentSettings, Section>>) {
  set({ ...settings, ...patch });
}

export function updateAgentSettings<S extends Section>(
  section: S,
  patch: Partial<AgentSettings[S]>,
) {
  set({ ...settings, [section]: { ...settings[section], ...patch } });
}

export function resetSettings(section?: Section) {
  set(
    section
      ? { ...settings, [section]: DEFAULT_SETTINGS[section] }
      : DEFAULT_SETTINGS,
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAgentSettings(): AgentSettings {
  return useSyncExternalStore(
    subscribe,
    () => settings,
    () => DEFAULT_SETTINGS,
  );
}

/** What rides along with a Director call. */
export function directorOverrides(): DirectorOverrides {
  const { model, systemPrompt, imageDetail } = settings.director;
  return { model: model.trim() || undefined, systemPrompt, imageDetail };
}

/** What rides along with a Concierge call. */
export function conciergeOverrides(): ConciergeOverrides {
  const { model, systemPrompt, imageDetail, webSearch, searchContextSize } =
    settings.concierge;
  return {
    model: model.trim() || undefined,
    systemPrompt,
    imageDetail,
    webSearch,
    searchContextSize,
  };
}
