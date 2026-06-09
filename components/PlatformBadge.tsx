import type { PlatformId } from "@/lib/types";
import { PlatformIcon } from "./icons";

export const PLATFORM_META: Record<
  PlatformId,
  { label: string; name: string; color: string; chipClass: string }
> = {
  twitch: {
    label: "TTV",
    name: "Twitch",
    color: "#9146ff",
    chipClass: "bg-twitch/15 text-[#c39bff] border-twitch/30",
  },
  kick: {
    label: "KICK",
    name: "Kick",
    color: "#53fc18",
    chipClass: "bg-kick/10 text-[#8dfc62] border-kick/25",
  },
  x: {
    label: "X",
    name: "X",
    color: "#e9e9ec",
    chipClass: "bg-white/8 text-cream border-white/20",
  },
};

/** Permanent, visually distinct source chip on every message. */
export function PlatformBadge({
  platform,
  size = "sm",
}: {
  platform: PlatformId;
  size?: "sm" | "md";
}) {
  const meta = PLATFORM_META[platform];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border font-mono tracking-wider ${meta.chipClass} ${
        size === "sm" ? "px-1 py-px text-[8.5px]" : "px-1.5 py-0.5 text-[10px]"
      }`}
    >
      <PlatformIcon platform={platform} className={size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"} />
      {meta.label}
    </span>
  );
}
