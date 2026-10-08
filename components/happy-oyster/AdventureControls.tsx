"use client";

// Adventure (mode 1) control deck. Movement is held state: every key is tracked
// independently so chords compose — W+A resolves to the protocol's Front_Left
// diagonal, Shift+W sprints, releasing one key of an axis falls back to
// whatever else is still held. The SDK re-sends the combined held command every
// generation chunk, so a held button keeps applying. Highlighting reads local
// press state (instant); world truth always comes from the model snapshot.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AdventureCommand } from "@reactor-models/happy-oyster";
import { useHappyOysterClient } from "./ho-client";
import { Hint, Panel, SectionLabel } from "./ui";

type Translation = NonNullable<AdventureCommand["translation"]>;
type Rotation = NonNullable<AdventureCommand["rotation"]>;
type Interaction = NonNullable<AdventureCommand["interaction"]>;
type Axis = "translation" | "rotation" | "interaction";

const KEY_AXIS: Record<string, Axis> = {
  w: "translation",
  a: "translation",
  s: "translation",
  d: "translation",
  arrowup: "rotation",
  arrowdown: "rotation",
  arrowleft: "rotation",
  arrowright: "rotation",
  " ": "interaction",
  shift: "interaction",
};

const MOVE_BASE: Record<string, Translation> = {
  w: "Front",
  s: "Back",
  a: "Left",
  d: "Right",
};
const MOVE_COMBO: Record<string, Translation> = {
  "a+w": "Front_Left",
  "d+w": "Front_Right",
  "a+s": "Back_Left",
  "d+s": "Back_Right",
};

const LOOK_BASE: Record<string, Rotation> = {
  arrowup: "Mouse_Up",
  arrowdown: "Mouse_Down",
  arrowleft: "Mouse_Left",
  arrowright: "Mouse_Right",
};
const LOOK_COMBO: Record<string, Rotation> = {
  "arrowleft+arrowup": "Mouse_Up_Left",
  "arrowright+arrowup": "Mouse_Up_Right",
  "arrowdown+arrowleft": "Mouse_Down_Left",
  "arrowdown+arrowright": "Mouse_Down_Right",
};

const ACT_BASE: Record<string, Interaction> = {
  " ": "Jump",
  shift: "Sprint",
};

// Resolve one axis from its held keys (insertion order = press order): the most
// recent key wins, upgraded to a diagonal when it pairs with another held key.
function resolveAxis<T extends string>(
  held: string[],
  base: Record<string, T>,
  combos: Record<string, T>,
): T | "None" {
  if (held.length === 0) return "None";
  const last = held[held.length - 1];
  for (let index = held.length - 2; index >= 0; index--) {
    const pair = [held[index], last].sort().join("+");
    const combo = combos[pair];
    if (combo) return combo;
  }
  return base[last] ?? "None";
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    !!element &&
    (element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA" ||
      element.isContentEditable)
  );
}

export function AdventureControls() {
  const { streaming, hold, interact, release, travelState } =
    useHappyOysterClient();
  const [pressed, setPressed] = useState<ReadonlySet<string>>(new Set());
  const heldRef = useRef<Record<Axis, string[]>>({
    translation: [],
    rotation: [],
    interaction: [],
  });

  const syncAxis = useCallback(
    (axis: Axis) => {
      const held = heldRef.current[axis];
      const value =
        axis === "translation"
          ? resolveAxis(held, MOVE_BASE, MOVE_COMBO)
          : axis === "rotation"
            ? resolveAxis(held, LOOK_BASE, LOOK_COMBO)
            : resolveAxis(held, ACT_BASE, {});
      void hold({ [axis]: value } as AdventureCommand).catch(() => {});
    },
    [hold],
  );

  const keyDown = useCallback(
    (key: string) => {
      const axis = KEY_AXIS[key];
      if (!axis) return;
      const held = heldRef.current[axis];
      if (!held.includes(key)) held.push(key);
      setPressed((prev) => new Set(prev).add(key));
      syncAxis(axis);
    },
    [syncAxis],
  );

  const keyUp = useCallback(
    (key: string) => {
      const axis = KEY_AXIS[key];
      if (!axis) return;
      heldRef.current[axis] = heldRef.current[axis].filter((k) => k !== key);
      setPressed((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      syncAxis(axis);
    },
    [syncAxis],
  );

  const clearAll = useCallback(() => {
    heldRef.current = { translation: [], rotation: [], interaction: [] };
    setPressed(new Set());
  }, []);

  useEffect(() => {
    if (!streaming) {
      clearAll();
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.repeat) return;
      const key = event.key.toLowerCase();
      if (KEY_AXIS[key]) {
        event.preventDefault();
        keyDown(key);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (KEY_AXIS[key]) {
        event.preventDefault();
        keyUp(key);
      }
    };
    // Releasing keys outside the window (cmd-tab, focus loss) never delivers
    // keyup; clear everything so no phantom input keeps steering the world.
    const onBlur = () => {
      clearAll();
      void hold({
        translation: "None",
        rotation: "None",
        interaction: "None",
      }).catch(() => {});
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [streaming, keyDown, keyUp, clearAll, hold]);

  const pad = (key: string, label: ReactNode, wide?: boolean) => (
    <Key
      label={label}
      active={pressed.has(key)}
      wide={wide}
      onDown={() => keyDown(key)}
      onUp={() => keyUp(key)}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel className="gap-4">
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Controls</SectionLabel>
          <span className="text-[12px] text-muted-foreground">
            Chords compose · W+A strafes · Shift+W sprints
          </span>
        </div>
        <div className="flex items-start justify-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <div className="grid grid-cols-3 grid-rows-2 gap-1.5">
              <span />
              {pad("w", "W")}
              <span />
              {pad("a", "A")}
              {pad("s", "S")}
              {pad("d", "D")}
            </div>
            <span className="text-[12px] font-medium text-muted-foreground">
              Move
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="grid grid-cols-3 grid-rows-2 gap-1.5">
              <span />
              {pad("arrowup", "↑")}
              <span />
              {pad("arrowleft", "←")}
              {pad("arrowdown", "↓")}
              {pad("arrowright", "→")}
            </div>
            <span className="text-[12px] font-medium text-muted-foreground">
              Look
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {pad(" ", "Jump · Space", true)}
          {pad("shift", "Sprint · Shift", true)}
        </div>
      </Panel>

      <ActionPanel
        verbs={[
          ...(travelState?.character_actions ?? []),
          ...(travelState?.environment_actions ?? []),
        ]}
        interact={interact}
        release={release}
      />
    </div>
  );
}

// Keycaps: white with a hairline and a soft bottom edge, pressing to blue.
const KEY_ACTIVE =
  "border-primary bg-primary text-primary-foreground shadow-[0_1px_0_rgba(0,0,0,0.1)]";
const KEY_OFF =
  "border-border bg-card text-foreground shadow-[0_1px_0_rgba(0,0,0,0.08)] hover:bg-muted";

function Key({
  label,
  active,
  wide,
  onDown,
  onUp,
}: {
  label: ReactNode;
  active: boolean;
  wide?: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <button
      onPointerDown={(event) => {
        event.preventDefault();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      className={`flex select-none items-center justify-center rounded-[10px] border font-medium transition touch-none active:scale-95 ${
        wide
          ? "h-10 px-3 text-[13px]"
          : "h-12 w-12 text-[17px] sm:h-11 sm:w-11 sm:text-[15px]"
      } ${active ? KEY_ACTIVE : KEY_OFF}`}
    >
      {label}
    </button>
  );
}

// The verbs the world advertises in travel_state (character_actions /
// environment_actions). The command channel accepts any string, but the world
// no-ops most things outside its advertised vocabulary, so only these are
// offered. A press holds the verb briefly (the SDK re-sends per chunk) then
// releases.
function ActionPanel({
  verbs,
  interact,
  release,
}: {
  verbs: string[];
  interact: (verb: string) => Promise<void>;
  release: (axes: { interaction?: true }) => Promise<void>;
}) {
  const [firing, setFiring] = useState<string | null>(null);

  const fire = (verb: string) => {
    if (!verb || firing) return;
    setFiring(verb);
    void interact(verb)
      .then(() => new Promise((resolve) => setTimeout(resolve, 1200)))
      .then(() => release({ interaction: true }))
      .catch(() => {})
      .finally(() => setFiring(null));
  };

  return (
    <Panel>
      <SectionLabel>World actions</SectionLabel>
      {verbs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {verbs.map((verb) => (
            <button
              key={verb}
              disabled={!!firing}
              onClick={() => fire(verb)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition disabled:opacity-40 ${
                firing === verb
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-fill"
              }`}
            >
              {verb}
            </button>
          ))}
        </div>
      ) : (
        <Hint>
          This world hasn&apos;t advertised any actions yet. When it does, they
          appear here as buttons.
        </Hint>
      )}
      {verbs.length > 0 && (
        <Hint>
          Actions the world exposes. Commands apply at the next generation
          chunk, so expect a beat of latency.
        </Hint>
      )}
    </Panel>
  );
}
