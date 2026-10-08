import { NextResponse } from "next/server";
import {
  mintReactorToken,
  readReactorKey,
  ReactorAuthError,
} from "@/lib/reactor-auth";

// How long we ask Reactor to make the JWT valid for. The server caps
// this at its configured maximum (currently 6h), so asking for more
// is harmless, you just get the server max back.
const TOKEN_LIFETIME_SECONDS = 6 * 60 * 60;

const KEY_PROBLEMS = {
  missing: "REACTOR_API_KEY is not set on the server",
  placeholder:
    "REACTOR_API_KEY in .env.local is still the example placeholder — paste your rk_ key and restart the dev server",
} as const;

// Mint a session-scoped Reactor JWT from your account's API key (see
// lib/reactor-auth.ts) and return it together with its `expires_at`, so the
// client can memoize it for exactly its lifetime.
//
// Why `no-store`?
//   The client owns the cache (see fetchToken in
//   components/happy-oyster/ho-client.tsx). Keeping the token in the app
//   rather than in the browser's HTTP cache makes its lifetime observable,
//   and keeps a cache miss from silently minting a second token part-way
//   through a session.
//
// Why GET and not POST?
//   Nothing about the request varies, and a GET reads as the lookup it is.
//   The route handler still POSTs to Reactor internally.
export async function GET() {
  const read = readReactorKey();
  if ("problem" in read) {
    return NextResponse.json(
      { error: KEY_PROBLEMS[read.problem] },
      { status: 500 },
    );
  }

  try {
    const { jwt, expires_at } = await mintReactorToken(
      read.key,
      TOKEN_LIFETIME_SECONDS,
    );
    // `expires_at` (unix seconds, decided by the server) lets the client
    // memoize the token for exactly its real lifetime.
    return NextResponse.json(
      { jwt, expires_at },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Reactor /tokens failed";
    const status =
      cause instanceof ReactorAuthError && cause.rejected ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
