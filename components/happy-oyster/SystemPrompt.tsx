"use client";

// A standing instruction for the world model — style, rules, tone — that rides
// along with every world you build. HappyOyster's create_world has no separate
// system field, so it is prepended to the world prompt itself when the intent
// is run (HappyOysterApp). It is
// kept in localStorage so it survives reloads; storage that throws or comes
// back empty just means starting blank.

import { useCallback, useEffect, useState } from "react";
import { FIELD, Hint, Panel, SectionLabel } from "./ui";

const STORAGE_KEY = "happy-oyster:system-prompt";

/** create_world's prompt cap, which the system prompt shares. */
export const MAX_WORLD_PROMPT_CHARS = 2000;
export const MAX_SYSTEM_PROMPT_CHARS = 1000;
const SEPARATOR = "\n\n";

export function useSystemPrompt(): [string, (value: string) => void] {
  const [value, setValue] = useState("");

  // Hydrate after mount so the server render and the first client render agree.
  useEffect(() => {
    try {
      setValue(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {}
  }, []);

  const update = useCallback((next: string) => {
    setValue(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return [value, update];
}

/** Characters left for the world prompt once the system prompt is attached. */
export function worldPromptBudget(systemPrompt: string): number {
  const system = systemPrompt.trim();
  return MAX_WORLD_PROMPT_CHARS - (system ? system.length + SEPARATOR.length : 0);
}

/** The world prompt with the system prompt in front, within the model's cap.
 * The world prompt is kept whole; only the system prompt is cut to fit. */
export function withSystemPrompt(prompt: string, systemPrompt: string): string {
  const room = MAX_WORLD_PROMPT_CHARS - prompt.length - SEPARATOR.length;
  const system = systemPrompt.trim().slice(0, Math.max(0, room)).trim();
  return system ? `${system}${SEPARATOR}${prompt}` : prompt;
}

export function SystemPromptField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <SectionLabel>System prompt</SectionLabel>
        {value && (
          <button
            onClick={() => onChange("")}
            className="text-[13px] text-primary transition hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={MAX_SYSTEM_PROMPT_CHARS}
        placeholder="Applied to every world you build… “Hand-painted watercolor style, soft morning light, no people.”"
        className={`${FIELD} resize-none`}
      />
      <Hint>
        Saved in this browser and prepended to every world you build. Attached
        worlds keep the prompt they were built with.
      </Hint>
    </Panel>
  );
}
