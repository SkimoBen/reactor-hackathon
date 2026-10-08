import { readReactorKey, verifyReactorKey } from "@/lib/reactor-auth";
import { HappyOysterApp } from "./HappyOysterApp";
import { SetupRequired } from "./SetupRequired";

// Server Component gate. Ways to render:
//   - NEXT_PUBLIC_HO_LOCAL_RUNTIME=1   → the live app against a local runtime (no key)
//   - REACTOR_API_KEY linked           → the live app, which mints JWTs server-side
//   - key missing, placeholder, or
//     rejected by Reactor              → the <SetupRequired /> landing, saying which
//
// The key is checked against Reactor once per server process (see
// lib/reactor-auth.ts), so a bad key shows up here rather than as a failed
// Connect. If Reactor can't be reached, the app renders and Connect reports it.
//
// `force-dynamic` skips static prerendering so the env check runs per-request.
export const dynamic = "force-dynamic";

export default async function Page() {
  if (process.env.NEXT_PUBLIC_HO_LOCAL_RUNTIME === "1")
    return <HappyOysterApp />;
  const read = readReactorKey();
  if ("problem" in read) return <SetupRequired problem={read.problem} />;
  if ((await verifyReactorKey(read.key)) === "rejected")
    return <SetupRequired problem="rejected" />;
  return <HappyOysterApp />;
}
