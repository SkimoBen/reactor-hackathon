// Dev-only preview of the Concierge overlay, so the iframe can be checked
// without talking the agent into ordering something. Probes the URL the same
// way the concierge route does, so blocked sites show the fallback card.
//   /dev/overlay?url=https://example.com&title=Joe%27s%20Pizza

import { notFound } from "next/navigation";
import { checkEmbeddable } from "@/lib/agent/concierge";
import { OverlayPreview } from "./OverlayPreview";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const url = params.url ?? "https://example.com";
  const embeddable =
    params.embeddable != null
      ? params.embeddable === "1"
      : await checkEmbeddable(url);

  return (
    <OverlayPreview
      target={{
        title: params.title ?? new URL(url).hostname,
        address: params.address ?? null,
        url,
        embeddable,
        note: params.note ?? null,
      }}
    />
  );
}
