import { Suspense } from "react";
import { OverlayFeed } from "@/components/OverlayFeed";

// /overlay — transparent chat feed for OBS browser sources.
// Usage: add a Browser Source pointed at
//   https://<host>/overlay?twitch=fazebanks&kick=fazebanks
// Channels come from URL params (OBS runs its own browser profile, so
// localStorage settings don't carry over). Defaults to Market Bubble.
export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <OverlayFeed />
    </Suspense>
  );
}
