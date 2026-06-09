import type { SVGProps } from "react";
import type { PlatformId } from "@/lib/types";

type IconProps = SVGProps<SVGSVGElement>;

export function TwitchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M4.3 2 2.6 6.2v17h5.8V26h3.2l2.7-2.8h4.2L24 17.5V2H4.3Zm17.5 14.4-3.2 3.2h-5.1l-2.7 2.7v-2.7H6.4V4.1h15.4v12.3Z" />
      <path d="M17.6 7.4h-2.1v6.2h2.1V7.4Zm-5.7 0h-2.1v6.2h2.1V7.4Z" />
    </svg>
  );
}

export function KickIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M3 2h7v6h2V6h2V4h2V2h5v6h-2v2h-2v2h2v2h2v6h-5v-2h-2v-2h-2v2H10v6H3V2Z" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

export function PlatformIcon({
  platform,
  ...props
}: { platform: PlatformId } & IconProps) {
  if (platform === "twitch") return <TwitchIcon {...props} />;
  if (platform === "kick") return <KickIcon {...props} />;
  return <XIcon {...props} />;
}

/** One-color mark in the show's register: a square speech bubble whose
 *  outline is broken by a stock-chart line exiting the top-right as an
 *  upward arrow, bubble tail at bottom-left. Renders in currentColor. */
export function BubbleMark(props: IconProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {/* bubble outline with an open gap at the top-right + tail bottom-left */}
      <path d="M22 8 H9 a3 3 0 0 0-3 3 v14 a3 3 0 0 0 3 3 h2 v6 l6-6 h13 a3 3 0 0 0 3-3 V17" />
      {/* the chart line escaping through the gap as an arrow */}
      <path d="M12 21 l5-5 3 3 6-7 2.5 2.5 L34 8" />
      <path d="M29.5 7 H35 v5.5" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.9a7.8 7.8 0 0 0 0-3.8l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-3.3-1.9L13.2 1h-4l-.5 2.6a7.7 7.7 0 0 0-3.3 1.9l-2.4-1-2 3.4 2 1.6a7.8 7.8 0 0 0 0 3.8l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 3.3 1.9l.5 2.6h4l.5-2.6a7.7 7.7 0 0 0 3.3-1.9l2.4 1 2-3.4-2-1.6Z" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <rect x="6" y="4" width="4.4" height="16" rx="1.2" />
      <rect x="13.6" y="4" width="4.4" height="16" rx="1.2" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M7 4.8c0-1 1.1-1.6 2-1.1l11 6.2c.9.5.9 1.7 0 2.2L9 18.3c-.9.5-2-.1-2-1.1V4.8Z" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 20l1-13M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <path d="M12 4v14m0 0-6-6m6 6 6-6" />
    </svg>
  );
}
