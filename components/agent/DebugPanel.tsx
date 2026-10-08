"use client";

// The panel behind the transcript's gear: a look inside the agents.
//
//   Calls    — every Director, Concierge and Watcher call, oldest first: the frame
//              that was sent, the exact system prompt and input text the
//              model saw, the tools it had and the calls it made (searches,
//              pages opened), its raw output and the decision we acted on.
//   Settings — the HappyOyster world's start prompt and create options, and
//              the knobs the agent calls read: model, system prompt, image
//              detail, web search, the Director's cadence, frame size and
//              how much of the log rides along. Edits apply to the next call.
//
// Portalled to <body> so the stage's frosted (backdrop-filter) ancestors
// don't trap its fixed positioning.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { START_SCENE, USER_LOCATION } from "@/lib/agent/config";
import { clearCalls, useDebugCalls, type DebugCall } from "@/lib/agent/debug";
import type { TraceToolCall } from "@/lib/agent/protocol";
import {
  resetSettings,
  updateAgentSettings,
  updateSettings,
  useAgentSettings,
} from "@/lib/agent/settings";

type Tab = "calls" | "settings";

const AGENT_TONE = {
  director: "text-primary",
  concierge: "text-[#c2410c]",
  watcher: "text-[#a16207]",
} as const;

export function DebugPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("calls");
  const calls = useDebugCalls();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-y-3 left-3 z-40 flex w-[min(560px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[20px] bg-white/85 shadow-[0_8px_40px_rgba(0,0,0,0.16)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150 sm:inset-y-6 sm:left-6">
      <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-3">
        <div className="flex rounded-full bg-black/[0.05] p-0.5">
          <TabButton active={tab === "calls"} onClick={() => setTab("calls")}>
            Calls{calls.length > 0 && ` · ${calls.length}`}
          </TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            Settings
          </TabButton>
        </div>
        <div className="flex items-center gap-1">
          {tab === "calls" && calls.length > 0 && (
            <button
              onClick={clearCalls}
              className="rounded-full px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition hover:bg-black/[0.05] hover:text-foreground"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close debug panel"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-black/[0.05] hover:text-foreground"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mx-4 h-px bg-black/[0.12]" />
      {tab === "calls" ? <CallList calls={calls} /> : <SettingsForm />}
    </div>,
    document.body,
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
        active
          ? "bg-white text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ── Calls ────────────────────────────────────────────────────────────────────

function CallList({ calls }: { calls: DebugCall[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow new calls, unless the user has scrolled up to read an older one.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [calls.length]);

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const el = event.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5"
    >
      {calls.length === 0 ? (
        <p className="text-[13px] leading-[1.45] text-muted-foreground">
          No agent calls yet. The Director looks at the stream every few
          seconds while a Directing world is live; the Concierge runs when you
          say something, and the Watcher checks frames while a shop's page waits
          for the scene to catch up.
        </p>
      ) : (
        calls.map((call) => <CallCard key={call.id} call={call} />)
      )}
    </div>
  );
}

function CallCard({ call }: { call: DebugCall }) {
  const { trace } = call;
  const utterance =
    typeof call.request.utterance === "string" ? call.request.utterance : null;

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-white/80 p-3 ring-1 ring-black/[0.06]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-[12px] font-semibold capitalize ${AGENT_TONE[call.agent]}`}>
          {call.agent}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {new Date(call.at).toLocaleTimeString()} · {(call.durationMs / 1000).toFixed(1)}s
        </span>
        {trace && (
          <span className="text-[11px] text-muted-foreground">
            · {trace.model}
            {trace.usage && ` · ${trace.usage.input} in / ${trace.usage.output} out`}
          </span>
        )}
      </div>

      {call.error && (
        <p className="break-words text-[12px] leading-snug text-destructive">
          {call.error}
        </p>
      )}

      {utterance && (
        <Field label="Utterance">
          <p className="text-[13px] text-foreground">“{utterance}”</p>
        </Field>
      )}

      {call.screenshot && (
        <Field label={`Frame${trace?.imageDetail ? ` · detail ${trace.imageDetail}` : ""}`}>
          <a href={call.screenshot} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL */}
            <img
              src={call.screenshot}
              alt={`Frame sent to the ${call.agent}`}
              className="w-full rounded-lg ring-1 ring-black/[0.06]"
            />
          </a>
        </Field>
      )}

      {trace ? (
        <>
          <Field label="Tools">
            <p className="text-[12px] text-foreground">
              {trace.tools.length ? trace.tools.join(", ") : "none"}
            </p>
          </Field>
          {trace.toolCalls.length > 0 && (
            <Field label={`Tool calls · ${trace.toolCalls.length}`}>
              <ol className="flex flex-col gap-1.5">
                {trace.toolCalls.map((toolCall, index) => (
                  <ToolCallRow key={index} call={toolCall} />
                ))}
              </ol>
            </Field>
          )}
          <Collapsible label="Input" open>
            <Pre>{trace.input}</Pre>
          </Collapsible>
          <Collapsible label="System prompt">
            <Pre>{trace.instructions}</Pre>
          </Collapsible>
          <Collapsible label="Raw output">
            <Pre>{pretty(trace.output)}</Pre>
          </Collapsible>
          <Collapsible label="Decision">
            <Pre>{JSON.stringify(call.result, null, 2)}</Pre>
          </Collapsible>
        </>
      ) : (
        <Collapsible label="Request" open>
          <Pre>{JSON.stringify(call.request, null, 2)}</Pre>
        </Collapsible>
      )}
    </div>
  );
}

function ToolCallRow({ call }: { call: TraceToolCall }) {
  const failed = call.status && call.status !== "completed";
  const status = failed ? (
    <span className="text-destructive"> ({call.status})</span>
  ) : null;
  switch (call.type) {
    case "search":
      return (
        <li className="text-[12px] leading-snug">
          <span className="font-semibold">search</span>{" "}
          {call.queries.length ? call.queries.map((q) => `“${q}”`).join(", ") : "(no query)"}
          {status}
          {call.sources.length > 0 && (
            <details className="mt-0.5">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                {call.sources.length} sources
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                {call.sources.map((url, index) => (
                  <li key={index} className="break-all text-[11px]">
                    <ExternalLink url={url} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </li>
      );
    case "open_page":
      return (
        <li className="break-all text-[12px] leading-snug">
          <span className="font-semibold">open page</span>{" "}
          {call.url ? <ExternalLink url={call.url} /> : "(unknown url)"}
          {status}
        </li>
      );
    case "find_in_page":
      return (
        <li className="break-all text-[12px] leading-snug">
          <span className="font-semibold">find</span> “{call.pattern}” in{" "}
          <ExternalLink url={call.url} />
          {status}
        </li>
      );
    case "other":
      return (
        <li className="break-all text-[12px] leading-snug">
          <span className="font-semibold">{call.name}</span>
          {status}
          <Pre>{call.detail}</Pre>
        </li>
      );
  }
}

function ExternalLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {url}
    </a>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Collapsible({
  label,
  open,
  children,
}: {
  label: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group">
      <summary className="cursor-pointer select-none text-[11px] font-semibold text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/[0.04] p-2 font-mono text-[11px] leading-[1.5] text-foreground">
      {children}
    </pre>
  );
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

function SettingsForm() {
  const settings = useAgentSettings();
  const { world, director, concierge } = settings;
  const defaults = useServerDefaults();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3.5">
      <p className="text-[12px] leading-snug text-muted-foreground">
        Changes apply to the next call (or the next world you start) and are
        remembered in this browser.
      </p>

      <Section title="HappyOyster world" tone="text-foreground" onReset={() => resetSettings("world")}>
        <SelectSetting
          label="Resolution"
          value={world.resolution}
          options={["480p", "720p"]}
          onChange={(resolution) => updateAgentSettings("world", { resolution })}
        />
        <SelectSetting
          label="Camera layout"
          value={world.layout}
          options={["Stable", "Fast"]}
          onChange={(layout) => updateAgentSettings("world", { layout })}
        />
        <SelectSetting
          label="Narrative"
          value={world.narrative}
          options={["default", "Calm", "Normal", "Dramatic"]}
          onChange={(narrative) => updateAgentSettings("world", { narrative })}
        />
        <PromptSetting
          label="Start prompt"
          hint="Sent with the first frame when you press Explore."
          value={world.prompt}
          onChange={(prompt) => updateAgentSettings("world", { prompt })}
        />
      </Section>

      <Section title="Director" tone={AGENT_TONE.director} onReset={() => resetSettings("director")}>
        <Toggle
          label="Enabled"
          hint="Watches the stream and steers it back to the real place."
          checked={director.enabled}
          onChange={(enabled) => updateAgentSettings("director", { enabled })}
        />
        <TextSetting
          label="Model"
          value={director.model}
          placeholder={defaults ? `${defaults.directorModel} (server default)` : "Server default"}
          onChange={(model) => updateAgentSettings("director", { model })}
        />
        <NumberSetting
          label="Interval"
          unit="s"
          value={director.intervalMs / 1000}
          min={2}
          max={120}
          step={0.5}
          onCommit={(seconds) =>
            updateAgentSettings("director", { intervalMs: Math.round(seconds * 1000) })
          }
        />
        <NumberSetting
          label="Cooldown after an instruction"
          unit="s"
          value={director.cooldownMs / 1000}
          min={0}
          max={120}
          step={1}
          onCommit={(seconds) =>
            updateAgentSettings("director", { cooldownMs: Math.round(seconds * 1000) })
          }
        />
        <SelectSetting
          label="Image detail"
          value={director.imageDetail}
          options={["low", "high", "auto"]}
          onChange={(imageDetail) => updateAgentSettings("director", { imageDetail })}
        />
        <PromptSetting
          hint="{place} is filled in on the server."
          value={director.systemPrompt}
          onChange={(systemPrompt) => updateAgentSettings("director", { systemPrompt })}
        />
      </Section>

      <Section title="Concierge" tone={AGENT_TONE.concierge} onReset={() => resetSettings("concierge")}>
        <TextSetting
          label="Model"
          value={concierge.model}
          placeholder={defaults ? `${defaults.conciergeModel} (server default)` : "Server default"}
          onChange={(model) => updateAgentSettings("concierge", { model })}
        />
        <Toggle
          label="Web search"
          hint="Lets it look up real businesses near the user."
          checked={concierge.webSearch}
          onChange={(webSearch) => updateAgentSettings("concierge", { webSearch })}
        />
        <SelectSetting
          label="Search context"
          value={concierge.searchContextSize}
          options={["low", "medium", "high"]}
          disabled={!concierge.webSearch}
          onChange={(searchContextSize) =>
            updateAgentSettings("concierge", { searchContextSize })
          }
        />
        <SelectSetting
          label="Image detail"
          value={concierge.imageDetail}
          options={["low", "high", "auto"]}
          onChange={(imageDetail) => updateAgentSettings("concierge", { imageDetail })}
        />
        <NumberSetting
          label="Wait check interval"
          unit="s"
          value={concierge.waitIntervalMs / 1000}
          min={1}
          max={30}
          step={0.5}
          onCommit={(seconds) =>
            updateAgentSettings("concierge", { waitIntervalMs: Math.round(seconds * 1000) })
          }
        />
        <NumberSetting
          label="Open anyway after"
          unit="s"
          value={concierge.waitTimeoutMs / 1000}
          min={5}
          max={300}
          step={5}
          onCommit={(seconds) =>
            updateAgentSettings("concierge", { waitTimeoutMs: Math.round(seconds * 1000) })
          }
        />
        <PromptSetting
          hint="{place} and {address} are filled in on the server."
          value={concierge.systemPrompt}
          onChange={(systemPrompt) => updateAgentSettings("concierge", { systemPrompt })}
        />
      </Section>

      <Section title="Both agents" tone="text-foreground">
        <NumberSetting
          label="Frame width"
          unit="px"
          value={settings.screenshotWidth}
          min={160}
          max={1920}
          step={32}
          onCommit={(screenshotWidth) =>
            updateSettings({ screenshotWidth: Math.round(screenshotWidth) })
          }
        />
        <NumberSetting
          label="Log lines sent"
          value={settings.eventWindow}
          min={0}
          max={200}
          step={1}
          onCommit={(eventWindow) => updateSettings({ eventWindow: Math.round(eventWindow) })}
        />
        <ReadOnly label="Place" value={START_SCENE.place} />
        <ReadOnly label="User address" value={USER_LOCATION.address} />
      </Section>

      <button
        onClick={() => resetSettings()}
        className="self-start rounded-full bg-black/[0.05] px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
      >
        Reset all to defaults
      </button>
    </div>
  );
}

/** The models the server falls back to, which env can change. */
function useServerDefaults() {
  const [defaults, setDefaults] = useState<{
    directorModel: string;
    conciergeModel: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setDefaults(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return defaults;
}

function Section({
  title,
  tone,
  onReset,
  children,
}: {
  title: string;
  tone: string;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h3 className={`text-[13px] font-semibold ${tone}`}>{title}</h3>
        {onReset && (
          <button
            onClick={onReset}
            className="text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

const ROW = "flex items-center justify-between gap-3";
const LABEL = "text-[12px] font-medium text-foreground";
const INPUT =
  "rounded-lg bg-black/[0.05] px-2.5 py-1.5 text-[12px] text-foreground outline-none transition placeholder:text-tertiary focus:bg-white focus:ring-2 focus:ring-primary/30 disabled:opacity-50";

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`${ROW} cursor-pointer`}>
      <span className="flex flex-col">
        <span className={LABEL}>{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--primary)]"
      />
    </label>
  );
}

function TextSetting({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={ROW}>
      <span className={LABEL}>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT} w-[min(260px,60%)] font-mono`}
      />
    </label>
  );
}

// Numbers commit on blur or Enter, so typing "15" doesn't clamp at "1".
function NumberSetting({
  label,
  unit,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <label className={ROW}>
      <span className={LABEL}>{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
          className={`${INPUT} w-20 text-right tabular-nums`}
        />
        {unit && <span className="w-4 text-[11px] text-muted-foreground">{unit}</span>}
      </span>
    </label>
  );
}

function SelectSetting<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className={ROW}>
      <span className={`${LABEL} ${disabled ? "opacity-50" : ""}`}>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className={INPUT}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function PromptSetting({
  label = "System prompt",
  hint,
  value,
  onChange,
}: {
  label?: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className={LABEL}>{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </span>
      <textarea
        value={value}
        rows={12}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT} resize-y font-mono text-[11px] leading-[1.5]`}
      />
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <span className="text-[12px] leading-snug text-muted-foreground">{value}</span>
    </div>
  );
}
