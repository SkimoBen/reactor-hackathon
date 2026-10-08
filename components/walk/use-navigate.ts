"use client";

// Walking directions, spoken or typed (lib/walk/commands.ts). The Concierge
// leaves directions alone, so these are the walk's:
//
//   "turn right onto 27th" — find that corner on the real street ahead, tell
//       the world to walk there and turn, and look up the new block's stores
//       in advance. When the character turns that way — even before the real
//       corner, as the world often does — the map puts them on that street
//       (lib/walk/tracker.ts PlannedTurn), the store labels follow, and the
//       world is told what's really on the new block so the scene matches.
//   "get back out onto the street" — tell the world to step back out, close
//       the site "explore" opened, and put the map back on the sidewalk if the
//       character hasn't visibly turned back by then.
//
// Only while a Directing world streams; otherwise the words go to the agents.

import { useCallback, useEffect, useRef, useState } from "react";
import { logEvent } from "@/lib/agent/events";
import { parseCommand, planTurn, resolveStreet, type TurnPlan } from "@/lib/walk/commands";
import { crossStreet, shortStreet, type Link } from "@/lib/walk/streets";
import { leaveStorefront, type PlannedTurn } from "@/lib/walk/tracker";
import type { Store } from "@/lib/walk/types";
import type { WorldSession } from "@/components/happy-oyster/use-world-session";
import type { OverlayControls } from "./use-explore";
import type { Walk } from "./use-walk";

const PLAN_TTL_MS = 120_000;
const EXIT_SETTLE_MS = 6_000;
const STORES_IN_INSTRUCTION = 2;

export interface Planned extends TurnPlan {
  at: number;
}

export function useNavigate({
  session,
  walk,
  plan,
  storesOn,
  prefetch,
  overlay,
  explored,
}: {
  session: WorldSession;
  walk: Walk;
  /** Shared with the walk's tracker. */
  plan: { current: PlannedTurn | null };
  storesOn: (on: Link) => { left: Store[]; right: Store[] } | null;
  prefetch: (edge: number) => void;
  overlay: OverlayControls;
  /** The place whose site "explore" last opened. */
  explored: { current: string | null };
}): { handle: (utterance: string) => boolean; planned: Planned | null } {
  const [planned, setPlanned] = useState<Planned | null>(null);
  const latest = useRef({ session, walk, storesOn, prefetch, overlay });
  latest.current = { session, walk, storesOn, prefetch, overlay };

  const clearPlan = useCallback(() => {
    plan.current = null;
    setPlanned(null);
  }, [plan]);

  const handle = useCallback(
    (utterance: string) => {
      const command = parseCommand(utterance);
      const { session, walk, prefetch, overlay } = latest.current;
      const client = session.client;
      if (!command || !client.streaming || client.worldState?.mode !== 2) return false;
      const instruct = (text: string) =>
        void client
          .instruct(text, { source: "user" })
          .catch((cause) => logEvent({ kind: "error", source: "user", text: message(cause) }));
      logEvent({ kind: "user_say", text: utterance });
      const street = walk.link.street;

      if (command.kind === "exit") {
        const store = explored.current;
        instruct(
          `You step back out of ${store ?? "the shop"} onto ${street} and carry on along the sidewalk.`,
        );
        if (store && overlay.overlayTitle === store) overlay.closeOverlay();
        explored.current = null;
        logEvent({ kind: "concierge", summary: `Heading back out onto ${shortStreet(street)}.` });
        setTimeout(() => latest.current.walk.apply(leaveStorefront), EXIT_SETTLE_MS);
        return true;
      }

      const named = command.street ? resolveStreet(command.street) : [];
      const found = command.street && named.length === 0 ? null : planTurn(walk, command.side, named);
      if (!found) {
        instruct(`You turn ${command.side}${command.street ? ` onto ${command.street}` : ""}.`);
        logEvent({
          kind: "concierge",
          summary: command.street
            ? `${command.street} isn't ahead on ${shortStreet(street)}; turning ${command.side} anyway.`
            : `Turning ${command.side}.`,
        });
        return true;
      }
      plan.current = { node: found.node, onto: found.onto, side: found.side };
      setPlanned({ ...found, at: Date.now() });
      prefetch(found.onto.edge);
      const onto = found.onto.street;
      const soon = found.distanceM < 30;
      instruct(
        soon
          ? `You turn ${command.side} onto ${onto} and walk along it.`
          : `You keep walking along ${street} to ${onto}, then turn ${command.side} onto it.`,
      );
      logEvent({
        kind: "concierge",
        summary: `Turning ${command.side} onto ${shortStreet(onto)}${
          soon ? " here" : ` in ${Math.round(found.distanceM)} m`
        }.`,
      });
      return true;
    },
    [plan, explored],
  );

  // The asked-for turn happened: describe the real block to the world so the
  // scene matches the map and the store labels.
  const turned = walk.turned;
  useEffect(() => {
    if (!planned || !turned || turned.at < planned.at) return;
    clearPlan();
    if (turned.street !== planned.onto.street) return;
    const on = latest.current.walk.link;
    const between = [crossStreet(on.from, on.street), crossStreet(on.to, on.street)];
    const stores = latest.current.storesOn(on);
    const describe = (side: string, list: Store[] = []) =>
      list.length
        ? `${list
            .slice(0, STORES_IN_INSTRUCTION)
            .map((s) => s.name.split(/\s[-–|]\s/)[0])
            .join(" and ")} on your ${side}`
        : null;
    const shops = [describe("left", stores?.left), describe("right", stores?.right)].filter(Boolean);
    const client = latest.current.session.client;
    if (!client.streaming) return;
    void client
      .instruct(
        `You walk along ${on.street}${between[0] && between[1] ? ` between ${between[0]} and ${between[1]}` : ""}${
          shops.length ? `, past ${shops.join(" and ")}` : ""
        }.`,
        { source: "user" },
      )
      .catch(() => {});
  }, [turned, planned, clearPlan]);

  // A plan the character never acted on lapses.
  useEffect(() => {
    if (!planned) return;
    const id = setTimeout(clearPlan, Math.max(0, planned.at + PLAN_TTL_MS - Date.now()));
    return () => clearTimeout(id);
  }, [planned, clearPlan]);

  return { handle, planned };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
