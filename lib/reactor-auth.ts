import { MODEL_NAMES } from "@reactor-models/happy-oyster";

// Everything that touches REACTOR_API_KEY — the link between this app and your
// Reactor account. Server-side only: import it from route handlers and Server
// Components, never from a client component, so the key never ships to the
// browser. The browser only ever sees the short-lived JWTs minted from it.
//
// Three ways the link can be broken, each reported precisely instead of as a
// generic connect failure:
//   - missing:     REACTOR_API_KEY isn't set;
//   - placeholder: it's still the example value from .env.example;
//   - rejected:    Reactor refused it (mistyped, revoked, another account).

export const ACCOUNT_API_KEYS_URL = "https://www.reactor.inc/account/api-keys";

const API_URL =
  process.env.NEXT_PUBLIC_REACTOR_API_URL || "https://api.reactor.inc";

// The models this app drives. A mode is fixed for the life of a session and
// picks which model the provider connects to, so the token has to be scoped
// to both. Reading `MODEL_NAMES` off the typed package rather than writing
// the names here keeps the scope from drifting from what the provider
// actually connects with — a scope that misses the connect name mints fine
// and then 403s on connect().
const SCOPED_MODELS = Object.values(MODEL_NAMES);

// Session budget for one token — how many sessions it may ever create
// (closed sessions still count). The client reuses one token for its whole
// lifetime, so leave room for a burst of reconnects.
const MAX_SESSIONS = 10;

// The verification token is never used, so it only needs to live long enough
// to prove the key works. The timeout is generous because the first page load
// of `pnpm dev` compiles while the check is in flight, which can hold up the
// response for several seconds; it only caps a Reactor that never answers.
const VERIFY_TOKEN_SECONDS = 60;
const VERIFY_TIMEOUT_MS = 15_000;

// Example values shipped in .env.example and the setup page.
const PLACEHOLDER = /your_|_here$|REPLACE/i;

export type ReactorKeyProblem = "missing" | "placeholder" | "rejected";

export function readReactorKey():
  | { key: string }
  | { problem: Exclude<ReactorKeyProblem, "rejected"> } {
  const key = process.env.REACTOR_API_KEY?.trim() ?? "";
  if (!key) return { problem: "missing" };
  if (PLACEHOLDER.test(key)) return { problem: "placeholder" };
  return { key };
}

export class ReactorAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /** Reactor refused the key itself, not a transient failure. */
  get rejected(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/**
 * Exchange the API key for a session-scoped JWT (see
 * docs.reactor.inc/authentication). `authorization_details` downscopes it:
 * the browser only ever holds a credential for these models' sessions, so a
 * leaked token is a bounded loss instead of an account key.
 */
export async function mintReactorToken(
  key: string,
  lifetimeSeconds: number,
  signal?: AbortSignal,
): Promise<{ jwt: string; expires_at: number }> {
  const res = await fetch(`${API_URL}/tokens`, {
    method: "POST",
    headers: { "Reactor-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: lifetimeSeconds,
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: SCOPED_MODELS } },
          constraints: { max_sessions: MAX_SESSIONS },
        },
      ],
    }),
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    const error = new ReactorAuthError(
      `Reactor /tokens returned ${res.status}`,
      res.status,
    );
    if (error.rejected) {
      error.message =
        `Reactor rejected REACTOR_API_KEY (${res.status}). Check the key at ` +
        `${ACCOUNT_API_KEYS_URL}, update .env.local, and restart the dev server.`;
    }
    throw error;
  }
  return (await res.json()) as { jwt: string; expires_at: number };
}

// One check per key per server process: the env only changes on restart, so
// a verdict for this key stands until then. A timeout or network failure
// isn't a verdict, so it's retried on the next page load.
let verdict: { key: string; result: Promise<VerifyResult> } | null = null;

type VerifyResult = "linked" | "rejected" | "unverified";

/** Whether Reactor accepts the key, checked by minting a throwaway token. */
export function verifyReactorKey(key: string): Promise<VerifyResult> {
  if (verdict?.key === key) return verdict.result;
  const result = mintReactorToken(
    key,
    VERIFY_TOKEN_SECONDS,
    AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  )
    .then((): VerifyResult => "linked")
    .catch(
      (cause): VerifyResult =>
        cause instanceof ReactorAuthError && cause.rejected
          ? "rejected"
          : "unverified",
    );
  verdict = { key, result };
  void result.then((value) => {
    if (value === "unverified" && verdict?.key === key) verdict = null;
  });
  return result;
}
