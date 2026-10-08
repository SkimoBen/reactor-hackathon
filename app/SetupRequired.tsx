import { Header } from "@/components/Header";
import {
  ACCOUNT_API_KEYS_URL,
  type ReactorKeyProblem,
} from "@/lib/reactor-auth";

// What's wrong with the link to your Reactor account, in one sentence.
const INTRO: Record<ReactorKeyProblem, string> = {
  missing:
    "This app needs your Reactor API key to mint session tokens. You only need to do this once.",
  placeholder:
    "REACTOR_API_KEY in .env.local is still the example placeholder from .env.example. Replace it with your own key.",
  rejected:
    "Reactor rejected the REACTOR_API_KEY in .env.local: it may be mistyped, revoked, or from another account. Paste a current key.",
};

// Server Component shown when REACTOR_API_KEY is missing, still the
// placeholder, or rejected by Reactor (see lib/reactor-auth.ts).
// Pure markup, no hooks, no client components, so it stays server-rendered.
export function SetupRequired({ problem }: { problem: ReactorKeyProblem }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-[22px] bg-card p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.06)] sm:p-10">
          <h2 className="text-[32px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
            {problem === "missing"
              ? "Setup required."
              : "Link your Reactor account."}
          </h2>
          <p className="mt-2 text-[17px] leading-snug text-muted-foreground">
            {INTRO[problem]}
          </p>

          <ol className="mt-8 space-y-5 text-[15px] leading-relaxed text-foreground">
            <li className="flex gap-3.5">
              <Step>1</Step>
              <span>
                Create an API key at{" "}
                <a
                  href={ACCOUNT_API_KEYS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  reactor.inc/account/api-keys
                </a>
                . It starts with <Code>rk_</Code>.
              </span>
            </li>
            <li className="flex gap-3.5">
              <Step>2</Step>
              <div className="min-w-0 flex-1">
                <p>
                  Save it to <Code>.env.local</Code> in the project root:
                </p>
                <pre className="mt-2.5 overflow-x-auto rounded-xl bg-muted px-4 py-3 font-mono text-[13px] text-foreground">
                  REACTOR_API_KEY=rk_your_key_here
                </pre>
              </div>
            </li>
            <li className="flex gap-3.5">
              <Step>3</Step>
              <span>
                Restart the dev server (<Code>pnpm dev</Code>) so the new
                variable is picked up.
              </span>
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-semibold text-white">
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  );
}
